import assert from "node:assert/strict";
import { buildV7HorizonSplit } from "../lib/intelligence/horizon-split.mjs";

function candidate(symbol, overrides = {}) {
  return {
    rank: 1,
    symbol,
    name: symbol,
    positionType: "CORE",
    decision: "OSSERVA",
    terminalDecision: "ACCUMULA",
    committeeScore: 70,
    confidence: 88,
    rawConfidenceBeforeCalibration: 98,
    riskScore: 30,
    scorecard: { valuation: 50 },
    valuation: { status: "non applicabile", upsideBasePercent: null },
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    committee: {
      marketRegime: "ATTENDERE",
      sourceGate: "GREEN",
      dataQuality: 97,
      allDecisions: [
        candidate("SPY"),
        candidate("ASML", { riskScore: 58, committeeScore: 71 }),
        candidate("TSM", { positionType: "GROWTH", committeeScore: 68, rawConfidenceBeforeCalibration: 93, riskScore: 52 }),
        candidate("MSFT", { decision: "ATTENDI", committeeScore: 43, riskScore: 53, scorecard: { valuation: 0 }, valuation: { status: "disponibile", upsideBasePercent: -70 } }),
        candidate("NVDA", { terminalDecision: "ATTENDI", committeeScore: 68, riskScore: 50 }),
      ],
    },
    decisionOutcomes: {
      horizons: {
        "7d": { restraintTradeoff: { sampleSize: 286, biasState: "TOO_CAUTIOUS", netProtectionMinusMissedPerDecisionPercent: -0.63 } },
        "30d": { restraintTradeoff: { sampleSize: 65, biasState: "TOO_CAUTIOUS", netProtectionMinusMissedPerDecisionPercent: -3.36 } },
      },
    },
    regimeAccuracy: {
      horizons: {
        "1session": { byRegime: { ATTENDERE: { sampleSize: 9, utilityRatePercent: 88.89 } } },
        "5sessions": { byRegime: { ATTENDERE: { sampleSize: 7, utilityRatePercent: 71.43 } } },
      },
    },
    ...overrides,
  };
}

const report = buildV7HorizonSplit(evidence());
assert.equal(report.safety.liveTradingAllowed, false);
assert.equal(report.safety.queueWritesAllowed, false);
assert.equal(report.safety.paperCertificationEvidenceMutationAllowed, false);
assert.equal(report.safety.feedsProposalReadiness, false);
assert.deepEqual(report.strategicShadowSymbols, ["ASML", "SPY", "TSM"]);

const spy = report.rows.find((row) => row.symbol === "SPY");
assert.equal(spy.tactical.state, "ATTENDERE");
assert.equal(spy.strategic.state, "ACCUMULA_A_TRANCHE_SHADOW");
assert.equal(spy.strategic.researchTranchePlan.orderCreationAllowed, false);

const msft = report.rows.find((row) => row.symbol === "MSFT");
assert.equal(msft.deepOvervaluation, true);
assert(msft.strategic.blockers.includes("DEEP_OVERVALUATION"));
assert.equal(msft.strategic.state, "NESSUNA_AZIONE_STRATEGICA");

const nvda = report.rows.find((row) => row.symbol === "NVDA");
assert(nvda.strategic.blockers.includes("TERMINAL_NOT_ACCUMULA"));
assert.equal(nvda.strategic.state, "NESSUNA_AZIONE_STRATEGICA");

const balanced = evidence();
balanced.decisionOutcomes.horizons["7d"].restraintTradeoff.biasState = "BALANCED";
balanced.decisionOutcomes.horizons["30d"].restraintTradeoff.biasState = "BALANCED";
const balancedReport = buildV7HorizonSplit(balanced);
assert.equal(balancedReport.strategicShadowCount, 0);
assert(balancedReport.rows.find((row) => row.symbol === "SPY").strategic.blockers.includes("MEDIUM_TERM_CAUTION_NOT_CONFIRMED"));

const weakSources = evidence();
weakSources.committee.sourceGate = "RED";
const weakReport = buildV7HorizonSplit(weakSources);
assert.equal(weakReport.strategicShadowCount, 0);
assert(weakReport.rows.find((row) => row.symbol === "SPY").strategic.blockers.includes("SOURCE_GATE_NOT_GREEN"));

console.log("Fenice V7 horizon split engine: PASS");
