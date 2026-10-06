import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { diagnosePaperV7Runway } from "./diagnose-paper-v7-runway.mjs";

const fingerprint = {
  version: 1,
  algorithm: "sha256",
  digest: "f".repeat(64),
  complete: true,
};
const campaign = {
  version: 6,
  startedAt: "2026-09-25T15:40:35.178Z",
  baselineCommit: "a".repeat(40),
  baselineFingerprint: fingerprint,
  requiredDays: 30,
  minEvidenceDays: 25,
  minPaperFills: 10,
  liveTradingAllowed: false,
  evidencePolicy: { freshMarketFxRequiredForNonEuroPaperFill: true },
  dailyEvidence: Array.from({ length: 12 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 8, 25 + index)).toISOString().slice(0, 10),
    validationFingerprint: fingerprint,
    cumulativePaperFilled: index === 11 ? 3 : Math.min(index, 2),
    liveOrders: 0,
    brokerConnectivityAllowed: false,
    liveTradingAllowed: false,
    reconciliationBalanced: true,
    reconciliationBreaks: 0,
    auditChainValid: true,
    fillEvidenceProof: {
      version: 2,
      requiredFills: 0,
      coveredFills: 0,
      complete: true,
      windows: [],
    },
  })),
};
const approval = {
  approved: true,
  humanConfirmation: true,
  mode: "PAPER",
  expiresAt: "2026-10-24T21:59:59.000Z",
  idPrefix: "fenice-paper-validation-v6-",
  targetPaperFills: 10,
  maxProbeAttemptsTotal: 20,
  maxOrdersPerDay: 1,
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
};
const state = {
  mode: "PAPER",
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
  executions: [
    { validationProbe: true, clientOrderId: "fenice-paper-validation-v6-2026-09-25-SPY", status: "PAPER_FILLED", createdAt: "2026-09-25T17:24:41Z" },
    { validationProbe: true, clientOrderId: "fenice-paper-validation-v6-2026-09-28-QQQ", status: "PAPER_FILLED", createdAt: "2026-09-28T18:01:39Z" },
    { validationProbe: true, clientOrderId: "fenice-paper-validation-v6-2026-10-06-SPY", status: "PAPER_FILLED", createdAt: "2026-10-06T15:15:47Z" },
  ],
};
const now = "2026-10-06T17:30:00.000Z";

const feasible = diagnosePaperV7Runway({ campaign, approval, state, now });
assert.equal(feasible.status, "FEASIBLE_UPPER_BOUND");
assert.equal(feasible.diagnosticOnly, true);
assert.equal(feasible.activationAllowed, false);
assert.equal(feasible.currentV6Modified, false);
assert.equal(feasible.liveTradingAllowed, false);
assert.equal(feasible.brokerConnectivityAllowed, false);
assert.equal(feasible.paperFills, 3);
assert.equal(feasible.fillsRemaining, 7);
assert.equal(feasible.historicalProbeAttempts, 3);
assert.equal(feasible.attemptsRemaining, 17);
assert.equal(feasible.usedToday, 1);
assert.equal(feasible.weekdaySlotsRemaining, 13);
assert.equal(feasible.maxPossibleAdditionalFills, 13);
assert.equal(feasible.runwayMargin, 6);
assert.equal(feasible.campaignMaturityAt, "2026-10-25T15:40:35.178Z");
assert.equal(feasible.maturityApprovalBufferHours, -17.7);
assert.equal(feasible.maturityWindowState, "MISALIGNED");
assert.ok(Object.values(feasible.safety).every(Boolean));

const tight = diagnosePaperV7Runway({
  campaign,
  approval: { ...approval, targetPaperFills: 15 },
  state,
  now,
});
assert.equal(tight.status, "TIGHT");
assert.equal(tight.fillsRemaining, 12);
assert.equal(tight.runwayMargin, 1);

const calendarImpossible = diagnosePaperV7Runway({
  campaign,
  approval,
  state,
  now: "2026-10-20T12:00:00.000Z",
});
assert.equal(calendarImpossible.status, "IMPOSSIBLE");
assert.equal(calendarImpossible.attemptsRemaining, 17);
assert.equal(calendarImpossible.weekdaySlotsRemaining, 4);
assert.equal(calendarImpossible.maxPossibleAdditionalFills, 4);

const expired = diagnosePaperV7Runway({
  campaign,
  approval,
  state,
  now: "2026-10-25T00:00:00.000Z",
});
assert.equal(expired.status, "IMPOSSIBLE");
assert.ok(expired.reasons.some((reason) => reason.includes("expired")));

const unsafe = diagnosePaperV7Runway({
  campaign,
  approval,
  state: { ...state, brokerConnectivityAllowed: true },
  now,
});
assert.equal(unsafe.status, "SAFETY_FAILURE");
assert.equal(unsafe.safety.stateBrokerLocked, false);

const revoked = diagnosePaperV7Runway({
  campaign,
  approval: { ...approval, approved: false, humanConfirmation: false, mode: "LIVE" },
  state,
  now,
});
assert.equal(revoked.status, "SAFETY_FAILURE");
assert.equal(revoked.safety.approvalActive, false);
assert.equal(revoked.safety.approvalHumanConfirmed, false);
assert.equal(revoked.safety.approvalPaperOnly, false);

const mismatchCampaign = {
  ...campaign,
  dailyEvidence: campaign.dailyEvidence.map((row, index) =>
    index === campaign.dailyEvidence.length - 1 ? { ...row, cumulativePaperFilled: 2 } : row),
};
const mismatch = diagnosePaperV7Runway({ campaign: mismatchCampaign, approval, state, now });
assert.equal(mismatch.status, "SAFETY_FAILURE");
assert.equal(mismatch.safety.fillCountersMatch, false);

const complete = diagnosePaperV7Runway({
  campaign: {
    ...campaign,
    dailyEvidence: campaign.dailyEvidence.map((row, index) =>
      index === campaign.dailyEvidence.length - 1 ? { ...row, cumulativePaperFilled: 3 } : row),
  },
  approval: { ...approval, targetPaperFills: 3 },
  state,
  now,
});
assert.equal(complete.status, "FILL_TARGET_COMPLETE");

const diagnosticWorkflow = await readFile(".github/workflows/paper-candidate-diagnostics.yml", "utf8");
assert.match(
  diagnosticWorkflow,
  /workflow_run:\n[\s\S]*- Fenice PAPER Validation Probe Cycle\n[\s\S]*types:\n\s+- completed/,
  "runway diagnostic must refresh after the canonical PAPER validation probe workflow completes",
);
assert.doesNotMatch(
  diagnosticWorkflow,
  /- Fenice PAPER Probe\n/,
  "obsolete workflow name must not silently disable runway refresh",
);
assert.match(diagnosticWorkflow, /permissions:\n\s+contents: read/);
assert.doesNotMatch(diagnosticWorkflow, /contents: write|actions: write|git push|gh workflow run/);

console.log("PAPER V7 runway diagnostic tests: PASS");
