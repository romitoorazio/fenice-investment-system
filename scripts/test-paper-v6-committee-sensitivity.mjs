import assert from "node:assert/strict";
import {
  analyzeCandidateCommitteeSensitivity,
  buildPaperV6CommitteeSensitivity,
  recomputeCommitteeScore,
} from "./analyze-paper-v6-committee-sensitivity.mjs";

const spy = {
  symbol: "SPY",
  committeeScore: 69,
  scorecard: {
    fundamental: 76,
    quality: 76,
    valuation: 50,
    technical: 77,
    riskAdjusted: 70,
    catalysts: 48,
    dataConfidence: 86,
  },
  valuation: { status: "non applicabile", upsideBasePercent: null },
};
const qqq = {
  symbol: "QQQ",
  committeeScore: 69,
  scorecard: {
    fundamental: 76,
    quality: 76,
    valuation: 50,
    technical: 79,
    riskAdjusted: 67,
    catalysts: 48,
    dataConfidence: 86,
  },
  valuation: { status: "non applicabile", upsideBasePercent: null },
};

assert.equal(recomputeCommitteeScore(spy).roundedScore, 69);
assert.equal(Number(recomputeCommitteeScore(spy).rawAfterPenalty.toFixed(2)), 69.4);
assert.equal(Number(recomputeCommitteeScore(qqq).rawAfterPenalty.toFixed(2)), 69.22);

const spySensitivity = analyzeCandidateCommitteeSensitivity(spy, 70);
assert.equal(spySensitivity.reconstructionMatches, true);
assert.equal(spySensitivity.pointsToThreshold, 1);
const spyDeltas = Object.fromEntries(spySensitivity.componentSensitivity.map((item) => [item.component, item.minimumScorecardDelta]));
assert.equal(spyDeltas.fundamental, 1);
assert.equal(spyDeltas.quality, 1);
assert.equal(spyDeltas.valuation, 1);
assert.equal(spyDeltas.technical, 1);
assert.equal(spyDeltas.riskAdjusted, 1);
assert.equal(spyDeltas.catalysts, 2);
assert.equal(spyDeltas.dataConfidence, 1);

const qqqSensitivity = analyzeCandidateCommitteeSensitivity(qqq, 70);
assert.equal(qqqSensitivity.reconstructionMatches, true);
const qqqDeltas = Object.fromEntries(qqqSensitivity.componentSensitivity.map((item) => [item.component, item.minimumScorecardDelta]));
assert.equal(qqqDeltas.fundamental, 2);
assert.equal(qqqDeltas.quality, 2);
assert.equal(qqqDeltas.valuation, 2);
assert.equal(qqqDeltas.technical, 3);
assert.equal(qqqDeltas.riskAdjusted, 2);
assert.equal(qqqDeltas.catalysts, 5);
assert.equal(qqqDeltas.dataConfidence, 3);

const report = buildPaperV6CommitteeSensitivity({
  approval: { version: 6, minCommitteeScore: 70 },
  opportunityMap: { activeV6OneGateAwayTargets: ["SPY", "QQQ"] },
  committee: { topDecisions: [spy, qqq] },
});
assert.equal(report.ready, true);
assert.equal(report.thresholdModified, false);
assert.equal(report.scoreFormulaModified, false);
assert.equal(report.liveTradingAllowed, false);
assert.equal(report.brokerConnectivityAllowed, false);
assert.deepEqual(report.activeV6Targets, ["SPY", "QQQ"]);
assert.deepEqual(report.reconstructionMismatches, []);

const mismatch = buildPaperV6CommitteeSensitivity({
  approval: { version: 6, minCommitteeScore: 70 },
  opportunityMap: { activeV6OneGateAwayTargets: ["SPY"] },
  committee: { topDecisions: [{ ...spy, committeeScore: 70 }] },
});
assert.equal(mismatch.ready, false);
assert.deepEqual(mismatch.reconstructionMismatches, ["SPY"]);
assert.deepEqual(mismatch.candidates[0].componentSensitivity, []);

assert.throws(
  () => buildPaperV6CommitteeSensitivity({ approval: {}, opportunityMap: {}, committee: {} }),
  /PAPER_V6_COMMITTEE_THRESHOLD_MISSING/,
);

console.log("paper V6 committee sensitivity tests: PASS");
