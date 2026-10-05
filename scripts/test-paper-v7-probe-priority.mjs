import assert from "node:assert/strict";
import { planPaperV7ProbePriority } from "./plan-paper-v7-probe-priority.mjs";

const diagnostic = {
  candidates: [
    { symbol: "A", failedGates: ["execution-coverage"], metrics: { committeeScore: 80, validationDataConfidence: 95, riskScore: 30, notionalCapacityEuro: 300 } },
    { symbol: "B", failedGates: ["execution-coverage", "committee-score"], metrics: { committeeScore: 69, validationDataConfidence: 96, riskScore: 20, notionalCapacityEuro: 300 } },
    { symbol: "C", failedGates: ["execution-coverage"], metrics: { committeeScore: 90, validationDataConfidence: 97, riskScore: 25, notionalCapacityEuro: 300 } },
    { symbol: "D", failedGates: ["execution-coverage", "committee-score", "data-confidence"], metrics: { committeeScore: 60, validationDataConfidence: 80, riskScore: 20, notionalCapacityEuro: 300 } },
  ],
};
const feasibility = {
  targets: [
    { symbol: "A", quorumCompatible: true, crossSourceSpreadPercent: 0.02 },
    { symbol: "B", quorumCompatible: true, crossSourceSpreadPercent: 0.03 },
    { symbol: "C", quorumCompatible: false, crossSourceSpreadPercent: 1.4 },
    { symbol: "D", quorumCompatible: true, crossSourceSpreadPercent: 0.04 },
    { symbol: "E", quorumCompatible: true, crossSourceSpreadPercent: 0.01 },
  ],
};

const report = planPaperV7ProbePriority({ diagnostic, feasibility });
assert.equal(report.plannedForVersion, 7);
assert.equal(report.activationAllowed, false);
assert.equal(report.currentV6Modified, false);
assert.equal(report.liveTradingAllowed, false);
assert.deepEqual(report.recommendedExpansionOrder, ["A", "B"]);
assert.equal(report.rows[0].symbol, "A");
assert.equal(report.rows[0].classification, "PROMOTE_COVERAGE_ONLY");
assert.equal(report.rows[1].symbol, "B");
assert.equal(report.rows[1].classification, "PROMOTE_ONE_STRUCTURAL_GATE");
assert.equal(report.rows.find((row) => row.symbol === "C").classification, "DEFER_PROVIDER_QUORUM");
assert.equal(report.rows.find((row) => row.symbol === "D").classification, "DEFER_MULTI_GATE");
assert.equal(report.rows.find((row) => row.symbol === "E").classification, "DEFER_MISSING_CANDIDATE");
assert.equal(report.recommendedExpansionOrder.includes("E"), false);
console.log("paper V7 probe priority planner tests: PASS");
