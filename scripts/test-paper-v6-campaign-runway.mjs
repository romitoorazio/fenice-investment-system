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
};

const probes = new Map([["2026-10-06", 1]]);
const report = evaluatePaperCampaignRunway({
  now: Date.parse("2026-10-06T17:50:00Z"),
  campaign,
  approval,
  cumulativePaperFills: 3,
  probesPerDay: probes,
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
});
assert.equal(afterWindow.availableProbeSlotsBeforeExpiry, 13, "elapsed current-day recovery window must not be counted");

const impossible = evaluatePaperCampaignRunway({
  now: Date.parse("2026-10-23T18:00:00Z"),
  campaign,
  approval,
  cumulativePaperFills: 3,
  probesPerDay: new Map([["2026-10-23", 1]]),
});
assert.equal(impossible.fillRunwayState, "INSUFFICIENT");
assert(impossible.availableProbeSlotsBeforeExpiry < impossible.remainingFills);

console.log("Fenice PAPER V6 campaign runway tests: PASS");
