import assert from "node:assert/strict";
import { summarizePaperCertificationWindow as assess } from "../lib/ui/paper-certification-window.ts";

const campaign = {
  startedAt: "2026-09-25T15:40:35.178Z",
  requiredDays: 30,
  minEvidenceDays: 25,
  minPaperFills: 10,
  dailyEvidence: [
    { date: "2026-09-25", observedAt: "2026-09-25T17:24:41.625Z", cumulativePaperFilled: 1 },
    { date: "2026-10-10", observedAt: "2026-10-10T20:21:34.173Z", cumulativePaperFilled: 6 },
  ],
};
const approval = {
  approved: true,
  approvedAt: "2026-09-24T20:10:00.000Z",
  expiresAt: "2026-10-24T21:59:59.000Z",
  mode: "PAPER",
  humanConfirmation: true,
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
};
const current = Date.parse("2026-10-11T17:00:00.000Z");
const outcome = assess(campaign, approval, current);

assert.equal(outcome.earliestMaturityAt, "2026-10-25T15:40:35.178Z");
assert.equal(outcome.authorizationExpiresAt, "2026-10-24T21:59:59.000Z");
assert.equal(outcome.state, "POST_APPROVAL_OBSERVATION_PLANNED");
assert.equal(outcome.ownerActionRequired, false);
assert.equal(outcome.approvalScope, "NEW_PAPER_PROBES_ONLY");
assert.equal(outcome.postExpiryObservationAllowed, true);
assert.equal(outcome.campaignMaturityRequiresActiveApproval, false);
assert.equal(outcome.newProbeWindowOpen, true);
assert.equal(outcome.elapsedDays, 16);
assert.equal(outcome.daysToMinMaturity, 14);
assert.equal(outcome.reportedFills, 6);
assert.equal(outcome.evidenceDays, 2);
assert.equal(outcome.numericalTargetsMet, false);
assert.equal(outcome.liveTradingAllowed, false);
assert.equal(outcome.certified, false);

const futureRows = {
  ...campaign, dailyEvidence: [
    ...campaign.dailyEvidence,
    { date: "2026-10-11", observedAt: "2026-10-12T00:00:00.000Z", cumulativePaperFilled: 10 },
    { date: "2026-02-30", observedAt: "2026-10-10T21:00:00.000Z", cumulativePaperFilled: 999 },
    { date: "2026-10-10", observedAt: "2026-10-10T20:21:34.173Z", cumulativePaperFilled: 6 },
  ],
};
assert.equal(assess(futureRows, approval, current).reportedFills, 6);
assert.equal(assess(futureRows, approval, current).evidenceDays, 2);
assert.equal(assess(campaign, { ...approval, approved: false }, current).state, "INVALID_POLICY");
assert.equal(assess(campaign, { ...approval, approvedAt: "2026-10-12T00:00:00.000Z" }, current).state, "INVALID_POLICY");
assert.equal(assess(campaign, { ...approval, humanConfirmation: false }, current).state, "INVALID_POLICY");
assert.equal(assess(campaign, { ...approval, mode: "LIVE" }, current).state, "INVALID_POLICY");
assert.equal(assess(campaign, { ...approval, expiresAt: "invalid" }, current).state, "INVALID_POLICY");
assert.equal(assess(campaign, approval, Date.parse("2026-10-25T15:40:35.178Z")).state, "AUTHORIZATION_EXPIRED");
assert.equal(assess({ ...campaign, startedAt: "2026-02-30T15:40:35.178Z" }, approval, current).state, "INVALID_POLICY");
assert.equal(assess(campaign, approval, current).reportedFills, assess(campaign, approval, current).reportedFills,
  "closed markets do not create a fill just because another day has elapsed");
const extended = { ...approval, expiresAt: "2026-11-03T22:59:59.000Z" };
const complete = { ...campaign, dailyEvidence: Array.from({ length: 25 }, (_, i) => {
  const date = new Date(Date.parse("2026-09-25T00:00:00.000Z") + i * 86400000).toISOString().slice(0, 10);
  return { date, observedAt: date + "T18:00:00.000Z", cumulativePaperFilled: 10 };
}) };
const matured = assess(complete, extended, Date.parse("2026-10-26T12:00:00.000Z"));
assert.equal(matured.state, "NUMERICAL_TARGETS_MET_REVIEW_ONLY");
assert.equal(matured.numericalTargetsMet, true);
assert.equal(matured.certified, false);
assert.equal(matured.liveTradingAllowed, false);

const passive = assess(complete, approval, Date.parse("2026-10-25T10:00:00.000Z"));
assert.equal(passive.state, "POST_APPROVAL_OBSERVATION");
assert.equal(passive.newProbeWindowOpen, false);
assert.equal(passive.ownerActionRequired, false);
assert.equal(passive.numericalTargetsMet, false, "expiry never shortens the 30 full days");
const completeExpired = assess(complete, approval, Date.parse("2026-10-26T12:00:00.000Z"));
assert.equal(completeExpired.state, "NUMERICAL_TARGETS_MET_REVIEW_ONLY");
assert.equal(completeExpired.newProbeWindowOpen, false);
assert.equal(completeExpired.ownerActionRequired, false);
assert.equal(completeExpired.certified, false);
const shortExpired = assess(campaign, approval, Date.parse("2026-10-26T12:00:00.000Z"));
assert.equal(shortExpired.approvalRenewalRequiredForMissingFills, true);
assert.equal(shortExpired.ownerActionRequired, true);
assert.equal(shortExpired.reportedFills, 6, "maturation cannot manufacture the missing fills");
assert.equal(assess({ ...campaign, startedAt: "2026-10-27T15:40:35.178Z" }, approval, current).state, "INVALID_POLICY");

console.log("Fenice PAPER authorization calendar: PASS");
