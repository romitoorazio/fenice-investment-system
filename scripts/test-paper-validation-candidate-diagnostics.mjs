import assert from "node:assert/strict";
import { buildPaperValidationProbe } from "./paper-validation-stager.mjs";
import { buildDiagnosticRuntimeApproval, explainPaperValidationCandidates } from "./explain-paper-validation-candidates.mjs";

const now = "2026-10-05T16:30:00.000Z";

function fixture() {
  return {
    campaign: {
      startedAt: "2026-09-25T15:40:35.178Z",
      baselineCommit: "baseline",
      baselineFingerprint: { complete: true },
      minPaperFills: 10,
      liveTradingAllowed: false,
    },
    approval: {
      approved: true,
      humanConfirmation: true,
      mode: "PAPER",
      expiresAt: "2026-12-31T23:59:59.000Z",
      liveTradingAllowed: false,
      brokerConnectivityAllowed: false,
      targetPaperFills: 10,
      maxProbeAttemptsTotal: 20,
      maxOrdersPerDay: 1,
      maxNotionalEuroPerOrder: 300,
      maxCapitalPercentPerProbe: 3,
      minTcaProbeNotionalEuro: 250,
      maxSingleAssetWeightPercentForProbe: 15,
      minCommitteeScore: 70,
      minValidationDataConfidence: 90,
      maxRiskScore: 75,
      permittedDecisionStates: ["ACCUMULA", "MANTIENI", "OSSERVA"],
      permittedCurrencies: ["USD", "EUR"],
      riskFxToEuroByCurrency: { USD: 0.9, EUR: 1 },
    },
    marketSession: {
      configured: true,
      generatedAt: now,
      evidence: { authoritative: true, state: "OPEN", observedAt: now },
      decision: { allowed: true },
      liveTradingAllowed: false,
    },
    coverage: {
      generatedAt: now,
      paperEligibleSymbols: 3,
      paperEligiblePercent: 100,
      policy: { liveTradingAllowed: false, minIndependentSourceFamilies: 2 },
      rows: [
        { symbol: "TEST", paperEligible: true, state: "CAUTION", independentSourceFamilies: 2, medianPrice: 100 },
        { symbol: "AUX1", paperEligible: true, state: "CAUTION", independentSourceFamilies: 2, medianPrice: 100 },
        { symbol: "AUX2", paperEligible: true, state: "CAUTION", independentSourceFamilies: 2, medianPrice: 100 },
      ],
    },
    state: {
      mode: "PAPER",
      liveTradingAllowed: false,
      brokerConnectivityAllowed: false,
      killSwitch: { engaged: false },
      reconciliation: { balanced: true, breaks: [] },
      executions: [],
      positions: [],
    },
    queue: { mode: "PAPER", orders: [] },
    terminal: {
      generatedAt: now,
      capitalEuro: 10000,
      assets: [{ symbol: "TEST", currency: "USD", confidence: 95, riskScore: 40, decision: "ACCUMULA" }],
    },
    committee: {
      generatedAt: now,
      sourceGate: "GREEN",
      dataQuality: 95,
      topDecisions: [{
        symbol: "TEST",
        currency: "USD",
        decision: "OSSERVA",
        committeeScore: 75,
        confidence: 86,
        rawConfidenceBeforeCalibration: 96,
        riskScore: 40,
      }],
    },
  };
}

function compare(input, expectedEligible, expectedFailedGate = null) {
  const core = buildPaperValidationProbe({ ...input, now });
  const diagnostic = explainPaperValidationCandidates(input);
  const test = diagnostic.candidates.find((row) => row.symbol === "TEST");
  assert.ok(test, "TEST candidate must appear in diagnostics");
  assert.equal(test.eligible, expectedEligible);
  assert.equal(core.staged, expectedEligible, `diagnostic/core eligibility drift: core reason=${core.reason}`);
  if (expectedFailedGate) assert.ok(test.failedGates.includes(expectedFailedGate), `${expectedFailedGate} must be reported`);
  assert.equal(diagnostic.diagnosticOnly, true);
  assert.equal(diagnostic.liveTradingAllowed, false);
  assert.equal(diagnostic.brokerConnectivityAllowed, false);
}

{
  const input = fixture();
  compare(input, true);
}

{
  const input = fixture();
  input.committee.topDecisions[0].committeeScore = 69;
  compare(input, false, "committee-score");
}

{
  const input = fixture();
  input.terminal.assets[0].decision = "ATTENDI";
  compare(input, false, "terminal-decision");
}

{
  const input = fixture();
  input.committee.topDecisions[0].rawConfidenceBeforeCalibration = 89;
  compare(input, false, "data-confidence");
}

{
  const input = fixture();
  input.committee.topDecisions[0].riskScore = 76;
  compare(input, false, "risk-score");
}

{
  const input = fixture();
  input.coverage.rows[0].paperEligible = false;
  input.coverage.rows[0].state = "RED";
  compare(input, false, "execution-coverage");
}

{
  const input = fixture();
  delete input.approval.riskFxToEuroByCurrency;
  const runtimeApproval = buildDiagnosticRuntimeApproval(input.approval, { metrics: { usdRate: 0.91 } });
  assert.deepEqual(runtimeApproval.riskFxToEuroByCurrency, { EUR: 1, USD: 0.91 });
  compare({ ...input, approval: runtimeApproval }, true);
}

console.log("paper validation candidate diagnostics tests: PASS");
