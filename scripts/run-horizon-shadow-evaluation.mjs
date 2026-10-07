import { readFile, writeFile } from "node:fs/promises";
import {
  summarizeForwardShadowLedger,
  updateForwardShadowLedger,
} from "../lib/intelligence/horizon-shadow-evaluator.mjs";

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

const horizonPath = String(process.env.FENICE_V7_HORIZON_PATH || "data/v7-horizon-split.json").trim();
const committeePath = String(process.env.FENICE_V7_COMMITTEE_PATH || "data/investment-committee.json").trim();
const ledgerPath = String(process.env.FENICE_V7_SHADOW_EVAL_LEDGER || "data/v7-horizon-shadow-evaluation-ledger.json").trim();
const reportPath = String(process.env.FENICE_V7_SHADOW_EVAL_REPORT || "data/v7-horizon-shadow-evaluation.json").trim();

const [horizonReport, committee, previous] = await Promise.all([
  readJson(horizonPath, {}),
  readJson(committeePath, {}),
  readJson(ledgerPath, { version: 1, records: [] }),
]);

const now = new Date();
const ledger = updateForwardShadowLedger(previous, { horizonReport, committee }, { now });
const report = {
  version: 1,
  generatedAt: now.toISOString(),
  purpose: "Forward-only scorecard for V7 staged shadow accumulation versus remaining in cash/waiting.",
  safety: {
    diagnosticOnly: true,
    modifiesV6DecisionPolicy: false,
    queueWritesAllowed: false,
    paperCertificationEvidenceMutationAllowed: false,
    brokerSubmissionAllowed: false,
    liveTradingAllowed: false,
    feedsProposalReadiness: false,
  },
  methodology: ledger.methodology,
  sourceState: ledger.sourceState,
  activeRecords: ledger.records.filter((record) => !record?.checkpoints?.["30d"]).length,
  totalRecords: ledger.recordCount,
  matured7d: summarizeForwardShadowLedger(ledger.records, "7d"),
  matured30d: summarizeForwardShadowLedger(ledger.records, "30d"),
  latestRecords: ledger.records.slice(-12).map((record) => ({
    id: record.id,
    symbol: record.symbol,
    observationDate: record.observationDate,
    referencePrice: record.referencePrice,
    lastPrice: record.lastPrice,
    stagedMarkToMarketPercent: record.stagedMarkToMarketPercent,
    lumpSumMarkToMarketPercent: record.lumpSumMarkToMarketPercent,
    executedTrancheCount: record.tranches.filter((tranche) => tranche.status === "EXECUTED").length,
    trancheStates: record.tranches.map((tranche) => ({
      number: tranche.number,
      targetOffsetDays: tranche.targetOffsetDays,
      status: tranche.status,
      price: tranche.price,
    })),
    checkpoint7d: record.checkpoints?.["7d"] ?? null,
    checkpoint30d: record.checkpoints?.["30d"] ?? null,
  })),
};

await writeFile(ledgerPath, JSON.stringify(ledger, null, 2) + "\n", "utf8");
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(
  "Fenice V7 forward shadow evaluation:",
  "records=", ledger.recordCount,
  "selectedNow=", ledger.sourceState.selectedNow.join(",") || "none",
  "7d=", report.matured7d.sampleSize,
  "30d=", report.matured30d.sampleSize,
  "sourceFresh=", ledger.sourceState.sourceFresh,
  "forwardOnly=true; liveTradingAllowed=false.",
);
