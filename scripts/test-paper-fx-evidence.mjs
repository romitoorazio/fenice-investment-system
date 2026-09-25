import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluatePaperFxEvidence,
  executionMatchesPaperFxEvidence,
} from "../lib/trading/paper-fx-evidence.mjs";

const now = Date.parse("2026-09-25T13:35:30Z");
const approval = {
  approved: true,
  mode: "PAPER",
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
  permittedCurrencies: ["USD", "EUR"],
  fxPolicy: {
    baseCurrency: "EUR",
    provider: "twelve-data",
    requiredForNonEuro: true,
    maxAgeSeconds: 120,
    allowedCurrencies: ["EUR", "USD"],
    usdPair: "USD/EUR",
  },
};
const fxEvidence = {
  version: 1,
  generatedAt: "2026-09-25T13:35:20Z",
  baseCurrency: "EUR",
  provider: "twelve-data",
  provenanceVerified: true,
  ratesToEuro: {
    EUR: { rate: 1, observedAt: "2026-09-25T13:35:20Z", source: "identity" },
    USD: { rate: 0.87867, observedAt: "2026-09-25T13:35:00Z", source: "Twelve Data /exchange_rate USD/EUR" },
  },
  maxAgeSeconds: 120,
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
};

const valid = evaluatePaperFxEvidence({ fxEvidence, approval, now });
assert.equal(valid.ready, true, valid.reasons.join(" | "));
assert.equal(valid.requiredForNonEuro, true);
assert.equal(valid.metrics.usdRate, 0.87867);
assert.equal(valid.metrics.usdAgeSeconds, 30);

for (const [name, mutated] of [
  ["stale", { ...fxEvidence, generatedAt: "2026-09-25T13:30:00Z", ratesToEuro: { ...fxEvidence.ratesToEuro, USD: { ...fxEvidence.ratesToEuro.USD, observedAt: "2026-09-25T13:30:00Z" } } }],
  ["wrong provider", { ...fxEvidence, provider: "unknown-provider" }],
  ["unverified", { ...fxEvidence, provenanceVerified: false }],
  ["LIVE leak", { ...fxEvidence, liveTradingAllowed: true }],
  ["broker leak", { ...fxEvidence, brokerConnectivityAllowed: true }],
  ["wrong pair", { ...fxEvidence, ratesToEuro: { ...fxEvidence.ratesToEuro, USD: { ...fxEvidence.ratesToEuro.USD, source: "Twelve Data EUR/USD" } } }],
  ["future timestamp", { ...fxEvidence, generatedAt: "2026-09-25T13:36:00Z", ratesToEuro: { ...fxEvidence.ratesToEuro, USD: { ...fxEvidence.ratesToEuro.USD, observedAt: "2026-09-25T13:36:00Z" } } }],
]) {
  const result = evaluatePaperFxEvidence({ fxEvidence: mutated, approval, now });
  assert.equal(result.ready, false, `${name} FX evidence must fail closed`);
}

const noApproval = evaluatePaperFxEvidence({ fxEvidence, approval: undefined, now });
assert.equal(noApproval.ready, false, "missing approval must fail closed");

const optionalFxPolicy = evaluatePaperFxEvidence({
  fxEvidence,
  approval: { ...approval, fxPolicy: { ...approval.fxPolicy, requiredForNonEuro: false } },
  now,
});
assert.equal(optionalFxPolicy.ready, false, "USD permission without mandatory market FX must fail closed");

const usdExecution = {
  clientOrderId: "paper-usd-1",
  currency: "USD",
  fxToEuro: 0.87867,
  fxProvider: "twelve-data",
  fxObservedAt: "2026-09-25T13:35:00Z",
};
assert.equal(executionMatchesPaperFxEvidence(usdExecution, valid), true);
assert.equal(executionMatchesPaperFxEvidence({ ...usdExecution, fxToEuro: 2 }, valid), false, "synthetic v5 FX must never match market evidence");
assert.equal(executionMatchesPaperFxEvidence({ ...usdExecution, fxProvider: "other" }, valid), false);
assert.equal(executionMatchesPaperFxEvidence({ ...usdExecution, fxProvider: null }, valid), false, "USD fill without persisted FX provider must fail certification");
assert.equal(executionMatchesPaperFxEvidence({ ...usdExecution, fxObservedAt: "2026-09-25T13:34:00Z" }, valid), false);
assert.equal(executionMatchesPaperFxEvidence({ ...usdExecution, fxObservedAt: null }, valid), false, "USD fill without persisted FX observation timestamp must fail certification");
assert.equal(executionMatchesPaperFxEvidence({ currency: "EUR", fxToEuro: 1 }, valid), true);
assert.equal(executionMatchesPaperFxEvidence({ currency: "EUR", fxToEuro: 0.99 }, valid), false);
assert.equal(executionMatchesPaperFxEvidence({ currency: "GBP", fxToEuro: 1.1 }, valid), false);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validationWorkflow = await readFile(path.join(root, ".github", "workflows", "paper-validation.yml"), "utf8");
const refreshFxCommand = "node scripts/refresh-paper-fx-evidence.mjs";
const baselineGateCommand = "npm run paper:baseline:require";
const refreshFxIndex = validationWorkflow.indexOf(refreshFxCommand);
const baselineGateIndex = validationWorkflow.indexOf(baselineGateCommand);
assert(refreshFxIndex >= 0, "canonical PAPER workflow must refresh market USD/EUR evidence");
assert(baselineGateIndex >= 0, "canonical PAPER workflow must retain the fail-closed baseline gate");
assert(refreshFxIndex < baselineGateIndex, "PAPER FX evidence must be refreshed before baseline eligibility is evaluated");

console.log("PAPER FX evidence invariants: PASS");
