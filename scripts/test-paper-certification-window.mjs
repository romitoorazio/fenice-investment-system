import assert from "node:assert/strict";
import { summarizePaperCertificationWindow as assess } from "../lib/ui/paper-certification-window.ts";

const fingerprint = "a".repeat(64);
const proofDay = (date, observedAt, cumulativePaperFilled, newPaperFills = 0) => ({
  date, observedAt, cumulativePaperFilled, newPaperFills,
  liveTradingAllowed: false, brokerConnectivityAllowed: false,
  auditChainValid: true, reconciliationBalanced: true, reconciliationBreaks: 0,
  validationFingerprint: { complete: true, digest: fingerprint },
  fillEvidenceProof: { complete: true, requiredFills: newPaperFills, coveredFills: newPaperFills },
});
const campaign = {
  baselineFingerprint: { complete: true, digest: fingerprint },
  startedAt: "2026-09-25T15:40:35.178Z",
  requiredDays: 30,
  minEvidenceDays: 25,
  minPaperFills: 10,
  dailyEvidence: [
    proofDay("2026-09-25", "2026-09-25T17:24:41.625Z", 1, 1),
    proofDay("2026-10-10", "2026-10-10T20:21:34.173Z", 6, 5),
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
assert.equal(outcome.preExpiryOperatorAttentionRequired, true, "missing PAPER fills near 24 October require human review");
assert.equal(outcome.daysUntilProbeExpiry, 14);
assert.equal(outcome.missingAuthorizedFills, 4);
assert.equal(outcome.missingVerifiedEvidenceDays, 23);
assert.equal(outcome.operatorReminderScope, "PRE_EXPIRY_REVIEW_ONLY");
assert.equal(outcome.operatorReminderMayAuthorizeProbes, false);
assert.equal(outcome.ownerActionRequired, false, "advisory must not mutate policy-state semantics");

assert.equal(outcome.elapsedDays, 16);
assert.equal(outcome.daysToMinMaturity, 14);
assert.equal(outcome.reportedFills, 6);
assert.equal(outcome.evidenceDays, 2);
assert.equal(outcome.verifiedEvidenceDays, 2);
assert.equal(outcome.evidenceIntegrityReviewRequired, false);
assert.equal(outcome.numericalTargetsMet, false);
assert.equal(outcome.liveTradingAllowed, false);
assert.equal(outcome.certified, false);

const fartherAhead = assess(campaign, approval, Date.parse("2026-10-01T12:00:00.000Z"));
assert.equal(fartherAhead.preExpiryOperatorAttentionRequired, false, "no warning before 14-day review window");
assert(fartherAhead.daysUntilProbeExpiry > 14);
const satisfiedBeforeExpiry = assess({
  ...campaign,
  dailyEvidence: [proofDay("2026-09-25", "2026-09-25T17:24:41.625Z", 10, 10)],
}, approval, current);
assert.equal(satisfiedBeforeExpiry.missingAuthorizedFills, 0);
assert.equal(satisfiedBeforeExpiry.preExpiryOperatorAttentionRequired, false);
assert.equal(assess(campaign, approval, Date.parse("2026-10-25T00:00:00.000Z")).preExpiryOperatorAttentionRequired, false,
  "expired probes must never be reauthorized by a reminder");
assert.equal(assess(campaign, { ...approval, approved: false }, current).preExpiryOperatorAttentionRequired, false,
  "invalid approval cannot generate actionable probe reminders");

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
  return proofDay(date, date + "T18:00:00.000Z", 10, i === 0 ? 10 : 0);
}) };
const matured = assess(complete, extended, Date.parse("2026-10-26T12:00:00.000Z"));
assert.equal(matured.state, "NUMERICAL_TARGETS_MET_REVIEW_ONLY");
assert.equal(matured.numericalTargetsMet, true);
assert.equal(matured.verifiedEvidenceDays, 25);
assert.equal(matured.evidenceIntegrityReviewRequired, false);
const requireIntegrity = mutate => {
  const data = structuredClone(complete);
  mutate(data);
  const state = assess(data, extended, Date.parse("2026-10-26T12:00:00.000Z"));
  assert.equal(state.evidenceDays, 25, "reported evidence is not the same as verified evidence");
  assert.equal(state.evidenceIntegrityReviewRequired, true);
  assert.equal(state.ownerActionRequired, true);
  assert.equal(state.numericalTargetsMet, false);
  assert.equal(state.certified, false);
  assert.equal(state.liveTradingAllowed, false);
  return state;
};
assert.equal(requireIntegrity(x => { x.dailyEvidence[3].auditChainValid = false; }).verifiedEvidenceDays, 24);
assert.equal(requireIntegrity(x => { x.dailyEvidence[4].reconciliationBalanced = false; }).verifiedEvidenceDays, 24);
assert.equal(requireIntegrity(x => { x.dailyEvidence[5].liveTradingAllowed = true; }).verifiedEvidenceDays, 24);
assert.equal(requireIntegrity(x => { x.dailyEvidence[6].validationFingerprint.digest = "b".repeat(64); }).verifiedEvidenceDays, 24);
assert.equal(requireIntegrity(x => { x.dailyEvidence[7].fillEvidenceProof.complete = false; }).verifiedEvidenceDays, 24);
assert.equal(requireIntegrity(x => { x.dailyEvidence[8].fillEvidenceProof.coveredFills = 2; }).verifiedEvidenceDays, 24);
assert.equal(requireIntegrity(x => { x.dailyEvidence[9].newPaperFills = 1; x.dailyEvidence[9].fillEvidenceProof.requiredFills = 1; x.dailyEvidence[9].fillEvidenceProof.coveredFills = 1; }).verifiedEvidenceDays, 25);
assert.equal(requireIntegrity(x => { x.baselineFingerprint.digest = "b".repeat(64); }).verifiedEvidenceDays, 0);
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
const lateFill = { ...campaign, dailyEvidence: [...campaign.dailyEvidence,
  { date: "2026-10-25", observedAt: "2026-10-25T10:00:00.000Z", cumulativePaperFilled: 10 }] };
const late = assess(lateFill, approval, Date.parse("2026-10-26T12:00:00.000Z"));
assert.equal(late.reportedFills, 10);
assert.equal(late.authorizedReportedFills, 6);
assert.equal(late.postExpiryFillIncreaseDetected, true);
assert.equal(late.ownerActionRequired, true);
assert.equal(late.numericalTargetsMet, false);
assert.equal(late.state, "POST_EXPIRY_FILL_INCREASE_REVIEW_REQUIRED");
const regressed = { ...complete, dailyEvidence: [...complete.dailyEvidence,
  { date: "2026-10-25", observedAt: "2026-10-25T10:00:00.000Z", cumulativePaperFilled: 9 }] };
const regression = assess(regressed, approval, Date.parse("2026-10-26T12:00:00.000Z"));
assert.equal(regression.fillCounterRegressionDetected, true);
assert.equal(regression.ownerActionRequired, true);
assert.equal(regression.numericalTargetsMet, false);
const earlierRegression = structuredClone(complete);
earlierRegression.dailyEvidence[23].cumulativePaperFilled = 12;
const earlier = assess(earlierRegression, approval, Date.parse("2026-10-26T12:00:00.000Z"));
assert.equal(earlier.authorizedReportedFills, 10);
assert.equal(earlier.fillCounterRegressionDetected, true);
assert.equal(earlier.numericalTargetsMet, false);
const renewal = { ...approval, approvedAt: "2026-10-26T09:00:00.000Z", expiresAt: "2026-11-03T22:59:59.000Z" };
const renewed = assess(campaign, renewal, Date.parse("2026-10-26T12:00:00.000Z"));
assert.equal(renewed.approvalValid, true, "a later approval may cover an existing campaign without resetting its start");
assert.equal(renewed.newProbeWindowOpen, true);
assert.equal(renewed.earliestMaturityAt, "2026-10-25T15:40:35.178Z");
assert.equal(renewed.reportedFills, 6);
assert.equal(assess({ ...campaign, startedAt: "2026-10-27T15:40:35.178Z" }, approval, current).state, "INVALID_POLICY");

// Ensure the warning is actually visible to users, with no direct approval mutation.
const { readFileSync } = await import("node:fs");
const readinessPage = readFileSync(new URL("../app/readiness/page.tsx", import.meta.url), "utf8");
assert.match(readinessPage, /calendar\.preExpiryOperatorAttentionRequired/);
assert.match(readinessPage, /Revisione umana prima della scadenza PAPER/);
assert.match(readinessPage, /calendar\.missingAuthorizedFills/);
assert.match(readinessPage, /non generare fill artificiali/);
assert.match(readinessPage, /non concede permessi/);

console.log("Fenice PAPER authorization calendar: PASS");
