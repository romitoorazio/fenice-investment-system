import assert from "node:assert/strict";
import { summarizePerformanceEvidence as summarize } from "../lib/ui/performance-evidence.ts";

const now = Date.parse("2026-10-11T17:00:00.000Z");
const fill = (id, at = "2026-10-09T15:24:44.836Z") => ({
  clientOrderId: id, symbol: "SPY", status: "PAPER_FILLED",
  filledAt: at, notionalEuro: 300, estimatedFeeEuro: 1.5, estimatedSlippageEuro: 0.15,
});
const paper = {
  mode: "PAPER",
  generatedAt: "2026-10-10T15:24:44.836Z",
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
  executions: [fill("one"), fill("two")],
};
const v7 = {
  generatedAt: "2026-10-10T01:55:40.353Z",
  ledgerRecordCount: 589,
  horizons: {
    "1d": { sampleSize: 551, decisions: { COMPRA: { sampleSize: 0 } }, restraintTradeoff: { biasState: "BALANCED" } },
    "7d": { sampleSize: 475, decisions: { COMPRA: { sampleSize: 0 } }, restraintTradeoff: { biasState: "TOO_CAUTIOUS" } },
    "30d": { sampleSize: 152, decisions: { COMPRA: { sampleSize: 0 } }, restraintTradeoff: { biasState: "TOO_CAUTIOUS" } },
    "90d": { sampleSize: 0, decisions: { COMPRA: { sampleSize: 0 } }, restraintTradeoff: { biasState: "INSUFFICIENT" } },
  },
};
const calibration = {
  generatedAt: "2026-10-10T02:00:00.000Z",
  horizons: {
    "7d": { state: "INSUFFICIENT", sampleSize: 0 },
    "30d": { state: "INSUFFICIENT", sampleSize: 0 },
    "90d": { state: "INSUFFICIENT", sampleSize: 0 },
  },
};

const out = summarize(paper, v7, calibration, now);
assert.equal(out.paper.safe, true);
assert.equal(out.paper.filledCount, 2);
assert.equal(out.paper.estimatedNotionalEuro, 600);
assert.equal(out.paper.estimatedFeesEuro, 3);
assert.equal(out.paper.estimatedSlippageEuro, 0.3);
assert.equal(out.paper.estimatedCombinedCostsEuro, 3.3);
assert.equal(out.paper.estimatedCostToNotionalPercent, 0.55);
assert.equal(out.v7.ledgerRecordCount, 589);
assert.equal(out.v7.horizons[1].totalDecisionObservations, 475);
assert.equal(out.v7.horizons[1].buySamples, 0);
assert.equal(out.v7.hasValidatedBuyOutcomes, false);
assert.equal(out.calibration.horizons[1].state, "INSUFFICIENT");
assert.equal(out.netReturnPercent, null);
assert.equal(out.euroNetPnl, null);
assert.equal(out.benchmarkExcessReturnPercent, null);
assert.equal(out.liveBrokerPerformanceVerified, false);
assert.equal(out.profitableStrategyVerified, false);

const unsafeMode = summarize({ ...paper, mode: "LIVE" }, v7, calibration, now);
assert.equal(unsafeMode.paper.filledCount, null);
assert.equal(unsafeMode.paper.estimatedCombinedCostsEuro, null);
assert.equal(summarize({ ...paper, liveTradingAllowed: true }, v7, calibration, now).paper.safe, false);
assert.equal(summarize({ ...paper, brokerConnectivityAllowed: true }, v7, calibration, now).paper.safe, false);
assert.equal(summarize({ ...paper, generatedAt: "2026-10-12T15:24:44.836Z" }, v7, calibration, now).paper.estimatedCombinedCostsEuro, null);
assert.equal(summarize({ ...paper, executions: [fill("one"), fill("one")] }, v7, calibration, now).paper.estimatedCombinedCostsEuro, null,
  "duplicate orders must not be double-counted");
assert.equal(summarize({ ...paper, executions: [{ ...fill("one"), estimatedFeeEuro: -1 }] }, v7, calibration, now).paper.estimatedCombinedCostsEuro, null);
assert.equal(summarize({ ...paper, executions: [{ ...fill("one"), estimatedFeeEuro: Number.NaN }] }, v7, calibration, now).paper.estimatedCombinedCostsEuro, null);
assert.equal(summarize({ ...paper, executions: [fill("one", "2026-10-12T15:24:44.836Z")] }, v7, calibration, now).paper.estimatedCombinedCostsEuro, null);
assert.equal(summarize({ ...paper, executions: [fill("one"), { ...fill("notfilled"), status: "PAPER_REJECTED" }] }, v7, calibration, now).paper.filledCount, 1);
assert.equal(summarize(paper, { ...v7, generatedAt: "2026-11-10T02:00:00.000Z" }, calibration, now).v7.horizons[0].buySamples, null);
assert.equal(summarize(paper, { ...v7, horizons: { ...v7.horizons, "1d": { sampleSize: 1, decisions: { COMPRA: { sampleSize: 2 } } } } }, calibration, now).v7.horizons[0].buySamples, null,
  "incoherent buy samples must not be presented as valid");
assert.equal(summarize(paper, v7, { ...calibration, generatedAt: "2026-11-10T00:00:00.000Z" }, now).calibration.horizons[0].sampleSize, null);
assert.equal(summarize(paper, v7, { ...calibration, horizons: { "7d": { state: "MATURE", sampleSize: 4 } } }, now).profitableStrategyVerified, false);
console.log("Fenice Performance Center fail-closed evidence tests: PASS");
