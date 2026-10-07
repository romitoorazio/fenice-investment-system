import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHistoricalDecisionOutcomeBackfill,
  selectDecisionOutcomeCandidates,
  summarizeDecisionOutcomes,
  updateDecisionOutcomeLedger,
} from "../lib/intelligence/decision-outcomes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");

async function readJson(name, fallback) {
  try { return JSON.parse(await readFile(path.join(dataDir, name), "utf8")); }
  catch { return fallback; }
}

async function readCommitteeHistory() {
  const dir = path.join(dataDir, "committee-history");
  try {
    const names = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
    const snapshots = [];
    for (const name of names) {
      try {
        const s = JSON.parse(await readFile(path.join(dir, name), "utf8"));
        if (s?.generatedAt && Array.isArray(s?.allDecisions)) snapshots.push(s);
      } catch {
        // Research backfill is fail-soft per historical file.
      }
    }
    return snapshots;
  } catch { return []; }
}

const committee = await readJson("investment-committee.json", { allDecisions: [], generatedAt: null, marketRegime: null });
let previous = await readJson("v7-decision-outcomes-ledger.json", { version: 1, records: [] });
const now = new Date();
const candidates = selectDecisionOutcomeCandidates(committee.allDecisions || []);
let bootstrap = { applied: false, sourceSnapshotCount: 0, seededRecords: 0 };

if (!Array.isArray(previous?.records) || previous.records.length === 0) {
  const snapshots = await readCommitteeHistory();
  const seeded = buildHistoricalDecisionOutcomeBackfill(snapshots);
  bootstrap = { applied: seeded.recordCount > 0, sourceSnapshotCount: snapshots.length, seededRecords: seeded.recordCount };
  if (seeded.recordCount > 0) previous = seeded;
}

const prices = new Map(
  (committee.allDecisions || [])
    .filter((x) => Number.isFinite(Number(x.currentPrice)))
    .map((x) => [String(x.symbol || "").toUpperCase(), Number(x.currentPrice)]),
);

const ledger = updateDecisionOutcomeLedger(previous, candidates, prices, {
  cycleId: committee.generatedAt || now.toISOString(),
  marketRegime: committee.marketRegime || null,
  now,
});

const horizons = Object.fromEntries(
  ["1d", "7d", "30d", "90d"].map((h) => [h, summarizeDecisionOutcomes(ledger.records, h)]),
);

const report = {
  version: 1,
  generatedAt: now.toISOString(),
  purpose: "V7 decision outcome scorecard: measure realised consequences of COMPRA/OSSERVA/ATTENDI/EVITA without changing V6 execution.",
  methodology: {
    checkpoints: ["1d", "7d", "30d", "90d"],
    buyRule: "COMPRA is favorable when forward return is positive.",
    avoidRule: "EVITA is favorable when forward return is non-positive.",
    waitRule: "OSSERVA/ATTENDI are not forced into a binary verdict; missed upside and avoided loss are measured with a 1% neutral band.",
    deDuplication: "maximum one observation per symbol, decision and UTC day",
    historicalBootstrap: "latest persisted committee snapshot per UTC weekday",
    feedsV6CalibrationPolicy: false,
  },
  bootstrap,
  isolation: {
    modifiesV6DecisionLedger: false,
    executionEligible: false,
    paperCertificationEligible: false,
    brokerSubmissionAllowed: false,
    liveTradingAllowed: false,
  },
  current: {
    committeeGeneratedAt: committee.generatedAt || null,
    marketRegime: committee.marketRegime || null,
    trackedDecisions: candidates.length,
    counts: candidates.reduce((acc, item) => {
      acc[item.decision] = (acc[item.decision] || 0) + 1;
      return acc;
    }, {}),
  },
  ledgerRecordCount: ledger.recordCount,
  horizons,
};

await writeFile(path.join(dataDir, "v7-decision-outcomes-ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
await writeFile(path.join(dataDir, "v7-decision-outcomes.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(
  `Fenice V7 decision outcomes: tracked=${candidates.length}; ledger=${ledger.recordCount}; bootstrap=${bootstrap.seededRecords}; 1d=${horizons["1d"].sampleSize}; 7d=${horizons["7d"].sampleSize}; 30d=${horizons["30d"].sampleSize}; researchOnly=true; liveTradingAllowed=false.`,
);
