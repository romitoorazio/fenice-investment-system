import assert from "node:assert/strict";
import { rankPaperValidationOpportunities } from "./rank-paper-validation-opportunities.mjs";

const diagnostic = {
  candidates: [
    {
      symbol: "READY",
      eligible: true,
      failedGates: [],
      metrics: { committeeScore: 80, validationDataConfidence: 95, riskScore: 30, notionalCapacityEuro: 300 },
    },
    {
      symbol: "COVERAGE_HIGH",
      eligible: false,
      failedGates: ["execution-coverage"],
      metrics: { committeeScore: 78, validationDataConfidence: 95, riskScore: 40, notionalCapacityEuro: 300 },
    },
    {
      symbol: "COVERAGE_LOW",
      eligible: false,
      failedGates: ["execution-coverage"],
      metrics: { committeeScore: 72, validationDataConfidence: 94, riskScore: 35, notionalCapacityEuro: 300 },
    },
    {
      symbol: "SCORE_ONLY",
      eligible: false,
      failedGates: ["committee-score"],
      metrics: { committeeScore: 69, validationDataConfidence: 96, riskScore: 25, notionalCapacityEuro: 300 },
    },
    {
      symbol: "MULTI",
      eligible: false,
      failedGates: ["committee-score", "data-confidence"],
      metrics: { committeeScore: 68, validationDataConfidence: 89, riskScore: 20, notionalCapacityEuro: 300 },
    },
  ],
};

const report = rankPaperValidationOpportunities(diagnostic);
assert.equal(report.diagnosticOnly, true);
assert.equal(report.liveTradingAllowed, false);
assert.equal(report.brokerConnectivityAllowed, false);
assert.deepEqual(report.eligibleNow, ["READY"]);
assert.equal(report.blockedCandidates, 4);
assert.equal(report.oneGateAwayCount, 3);
assert.equal(report.coverageOnlyCount, 2);
assert.deepEqual(report.coverageOnlyTargets, ["COVERAGE_HIGH", "COVERAGE_LOW"]);
assert.deepEqual(
  report.nearestBlocked.map((candidate) => candidate.symbol),
  ["COVERAGE_HIGH", "COVERAGE_LOW", "SCORE_ONLY", "MULTI"],
);
assert.equal(report.nearestBlocked[0].priorityClass, "COVERAGE_ONLY");
assert.equal(report.nearestBlocked[2].priorityClass, "ONE_GATE_AWAY");
assert.equal(report.nearestBlocked[3].priorityClass, "MULTI_GATE");

console.log("paper validation opportunity ranking tests: PASS");
