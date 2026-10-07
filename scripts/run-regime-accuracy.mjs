import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegimeAccuracyLedger, summarizeRegimeAccuracy } from "../lib/intelligence/regime-accuracy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const historyDir = path.join(dataDir, "committee-history");

async function readHistory() {
  try {
    const names = (await readdir(historyDir)).filter((name) => name.endsWith(".json")).sort();
    const snapshots = [];
    for (const name of names) {
      try {
        const snapshot = JSON.parse(await readFile(path.join(historyDir, name), "utf8"));
        if (snapshot?.generatedAt && Array.isArray(snapshot?.allDecisions)) snapshots.push(snapshot);
      } catch {
        // Research-only history is fail-soft per malformed snapshot.
      }
    }
    return snapshots;
  } catch {
    return [];
  }
}

const snapshots = await readHistory();
const ledger = buildRegimeAccuracyLedger(snapshots);
const latest = ledger.records.at(-1) || null;
const horizons = {};
for (const checkpoint of ["1session", "5sessions", "20sessions", "60sessions"]) {
  horizons[checkpoint] = summarizeRegimeAccuracy(ledger.records, checkpoint);
}

const regimeCounts = ledger.records.reduce((acc, record) => {
  acc[record.regime] = (acc[record.regime] || 0) + 1;
  return acc;
}, {});

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  purpose: "V7 regime accuracy scorecard. Measures whether Fenice market regimes were useful against a broad ETF benchmark basket.",
  methodology: ledger.methodology,
  isolation: ledger.isolation,
  current: {
    latestObservationDate: latest?.observationDate || null,
    latestRegime: latest?.regime || null,
    validRegimeDays: ledger.recordCount,
    regimeCounts,
  },
  horizons,
};

await writeFile(path.join(dataDir, "v7-regime-accuracy-ledger.json"), JSON.stringify(ledger, null, 2) + "\n", "utf8");
await writeFile(path.join(dataDir, "v7-regime-accuracy.json"), JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(
  "Fenice V7 regime accuracy:",
  "days=", ledger.recordCount,
  "latest=", latest?.regime || "none",
  "1session=", horizons["1session"].sampleSize,
  "5sessions=", horizons["5sessions"].sampleSize,
  "20sessions=", horizons["20sessions"].sampleSize,
  "researchOnly=true; liveTradingAllowed=false.",
);
