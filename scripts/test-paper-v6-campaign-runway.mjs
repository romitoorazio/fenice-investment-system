import assert from "node:assert/strict";
import { evaluatePaperCampaignRunway } from "../lib/intelligence/paper-campaign-runway.mjs";

const campaign = {
  startedAt: "2026-09-25T15:40:35.178Z",
  requiredDays: 30,
  minPaperFills: 10,
};
const approval = {
  expiresAt: "2026-10-24T21:59:59.000Z",
  targetPaperFills: 10,
  maxOrdersPerDay: 1,
  maxProbeAttemptsTotal: 20,
};

const probes = new Map([["2026-10-06", 1]]);
const report = evaluatePaperCampaignRunway({
  now: Date.parse("2026-10-06T17:50:00Z"),
  campaign,
  approval,
  cumulativePaperFills: 3,
  probesPerDay: probes,
  historicalProbeAttempts: 3,
});

assert.equal(report.remainingFills, 7);
assert.equal(report.calendarMaturityAt, "2026-10-25T15:40:35.178Z");
assert.equal(report.maturityBeforeApprovalExpiry, false);
assert.equal(report.maturityApprovalBufferHours, -17.7);
assert.equal(report.maturityWindowState, "POST_APPROVAL_OBSERVATION");
assert.equal(report.approvalScope, "NEW_PAPER_PROBES_ONLY");
assert.equal(report.campaignMaturityRequiresActiveApproval, false);
assert.equal(report.postExpiryObservationAllowed, true);
assert(report.availableProbeSlotsBeforeExpiry >= 7);
assert.equal(report.fillRunwayState, "SAFE");
assert(report.earliestTargetFillDate);


const afterWindow = evaluatePaperCampaignRunway({
  now: Date.parse("2026-10-06T20:00:00Z"),
  campaign,
  approval,
  cumulativePaperFills: 2,
  probesPerDay: new Map(),
  historicalProbeAttempts: 4,
});
assert.equal(afterWindow.availableProbeSlotsBeforeExpiry, 13, "elapsed current-day recovery window must not be counted");

const impossible = evaluatePaperCampaignRunway({
  now: Date.parse("2026-10-23T18:00:00Z"),
  campaign,
  approval,
  cumulativePaperFills: 3,
  probesPerDay: new Map([["2026-10-23", 1]]),
  historicalProbeAttempts: 10,
});
assert.equal(impossible.fillRunwayState, "INSUFFICIENT");
assert(impossible.availableProbeSlotsBeforeExpiry < impossible.remainingFills);


const capLimited = evaluatePaperCampaignRunway({
  now: Date.parse("2026-10-18T19:00:00Z"),
  campaign, approval: {...approval, maxProbeAttemptsTotal: 10},
  cumulativePaperFills: 7, historicalProbeAttempts: 9,
  probesPerDay: new Map(),
});
assert.equal(capLimited.calendarSlotsBeforeExpiry, 5);
assert.equal(capLimited.remainingAttemptBudget, 1);
assert.equal(capLimited.availableProbeSlotsBeforeExpiry, 1);
assert.equal(capLimited.fillRunwayState, "INSUFFICIENT");
assert.equal(capLimited.earliestTargetFillDate, null);
assert.equal(capLimited.attemptBudgetVerified, true);
assert.equal(capLimited.assumptions.attemptBudgetCapsCalendarSlots, true);

const actualWindow = evaluatePaperCampaignRunway({
  now: Date.parse("2026-10-18T19:00:00Z"), campaign, approval,
  cumulativePaperFills: 7, historicalProbeAttempts: 9,
  probesPerDay: new Map(),
});
assert.equal(actualWindow.calendarSlotsBeforeExpiry, 5);
assert.equal(actualWindow.availableProbeSlotsBeforeExpiry, 5);
assert.equal(actualWindow.remainingAttemptBudget, 11);
assert.equal(actualWindow.fillRunwayState, "TIGHT");
assert.equal(actualWindow.earliestTargetFillDate, "2026-10-21");

const unknownBudget = evaluatePaperCampaignRunway({
  now: Date.parse("2026-10-18T19:00:00Z"), campaign, approval,
  cumulativePaperFills: 7,
});
assert.equal(unknownBudget.attemptBudgetVerified, false);
assert.equal(unknownBudget.fillRunwayState, "ATTEMPT_BUDGET_UNVERIFIED");
assert.equal(unknownBudget.availableProbeSlotsBeforeExpiry, 0);
assert.equal(unknownBudget.remainingAttemptBudget, null);
assert.equal(unknownBudget.earliestTargetFillDate, null);

const inconsistentHistory = evaluatePaperCampaignRunway({
  now: Date.parse("2026-10-18T19:00:00Z"), campaign, approval,
  cumulativePaperFills: 7, historicalProbeAttempts: 6,
});
assert.equal(inconsistentHistory.attemptBudgetVerified, false);
assert.equal(inconsistentHistory.fillRunwayState, "ATTEMPT_BUDGET_UNVERIFIED");

console.log("Fenice PAPER V6 campaign runway tests: PASS");
