import assert from "node:assert/strict";
import { planPaperV7ProbeUniverse } from "./plan-paper-v7-probe-universe.mjs";

const evidence = {
  capabilities: {
    probeUniverse: ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "IWM", "META", "GOOGL", "AMZN", "ASML", "TSM", "BTC"],
    twelveDataProbeLimit: 4,
    twelveDataProbedSymbols: ["SPY", "QQQ", "AAPL", "MSFT"],
  },
};

const report = planPaperV7ProbeUniverse({
  evidence,
  priorityPlan: { recommendedExpansionOrder: ["ASML"] },
});
assert.equal(report.plannedForVersion, 7);
assert.equal(report.activationAllowed, false);
assert.equal(report.currentV6Modified, false);
assert.equal(report.liveTradingAllowed, false);
assert.equal(report.currentV6.protectedBaseVerified, true);
assert.deepEqual(report.currentV6.protectedBaseSymbols, ["SPY", "QQQ", "AAPL", "MSFT"]);
assert.deepEqual(report.currentV6.twelveDataProbedSymbols, ["SPY", "QQQ", "AAPL", "MSFT"]);
assert.deepEqual(report.futureV7.plannedTwelveDataSymbols, ["SPY", "QQQ", "AAPL", "MSFT", "ASML"]);
assert.deepEqual(report.futureV7.promotedSymbolsIncluded, ["ASML"]);
assert.deepEqual(report.futureV7.staticPrefixAtPlannedSize, ["SPY", "QQQ", "AAPL", "MSFT", "NVDA"]);
assert.deepEqual(report.futureV7.promotionsOutsideStaticPrefix, ["ASML"]);
assert.equal(report.futureV7.additionalBatchCredits, 1);
assert.equal(report.futureV7.adaptiveSelectionRequired, true);
assert.equal(report.futureV7.runtimeSelectionChangeRequired, true);
assert.equal(report.futureV7.frozenCoreChangeRequiredForActivation, true);
assert.ok(report.activationBlockers.includes("active-v6-fingerprint-must-remain-unchanged"));

const alreadyCovered = planPaperV7ProbeUniverse({
  evidence,
  priorityPlan: { recommendedExpansionOrder: ["SPY"] },
});
assert.deepEqual(alreadyCovered.futureV7.plannedTwelveDataSymbols, ["SPY", "QQQ", "AAPL", "MSFT"]);
assert.equal(alreadyCovered.futureV7.additionalBatchCredits, 0);
assert.equal(alreadyCovered.futureV7.adaptiveSelectionRequired, false);

const constrained = planPaperV7ProbeUniverse({
  evidence,
  priorityPlan: { recommendedExpansionOrder: ["ASML", "TSM"] },
  maxBatchSymbols: 5,
});
assert.deepEqual(constrained.futureV7.promotedSymbolsIncluded, ["ASML"]);
assert.deepEqual(constrained.futureV7.deferredByCeiling, ["TSM"]);
assert.ok(constrained.activationBlockers.includes("recommended-symbols-exceed-current-batch-ceiling"));

const missing = planPaperV7ProbeUniverse({
  evidence,
  priorityPlan: { recommendedExpansionOrder: ["UNKNOWN"] },
});
assert.deepEqual(missing.futureV7.promotedSymbolsIncluded, []);
assert.deepEqual(missing.futureV7.missingFromProbeUniverse, ["UNKNOWN"]);
assert.ok(missing.activationBlockers.includes("recommended-symbol-missing-from-probe-universe"));

for (const badBase of [
  ["SPY", "QQQ", "AAPL"],
  ["QQQ", "SPY", "AAPL", "MSFT"],
  ["SPY", "QQQ", "AAPL", "MSFT", "NVDA"],
]) {
  assert.throws(
    () => planPaperV7ProbeUniverse({
      evidence: {
        capabilities: {
          ...evidence.capabilities,
          twelveDataProbedSymbols: badBase,
        },
      },
      priorityPlan: { recommendedExpansionOrder: ["ASML"] },
    }),
    /PAPER_V7_PROTECTED_BASE_MISMATCH/,
  );
}

console.log("paper V7 adaptive probe universe tests: PASS");
