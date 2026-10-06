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
assert.equal(report.maturityBeforeApprovalExpiry, true);
assert(report.maturityApprovalBufferHours > 0);
assert(report.availableProbeSlotsBeforeExpiry >= 7);
assert.equal(report.fillRunwayState, "SAFE");
assert(report.earliestTargetFillDate);

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
