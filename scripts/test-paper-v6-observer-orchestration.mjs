import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluatePaperCampaignRunway } from "../lib/intelligence/paper-campaign-runway.mjs";

const workflow=readFileSync(".github/workflows/paper-v6-campaign-observer.yml","utf8");
const campaign=JSON.parse(readFileSync("data/paper-validation-campaign.json","utf8"));
const approval=JSON.parse(readFileSync("data/paper-validation-approval.json","utf8"));
const continuation=JSON.parse(readFileSync("data/paper-v6-continuation-plan.json","utf8"));

const originalExpiry="2026-10-24T21:59:59.000Z";
const maturity="2026-10-25T15:40:35.178Z";
assert.equal(campaign.startedAt,"2026-09-25T15:40:35.178Z");
assert.equal(approval.expiresAt,originalExpiry);
assert.equal(Date.parse(campaign.startedAt)+campaign.requiredDays*86400000,Date.parse(maturity));
assert(Date.parse(maturity)>Date.parse(originalExpiry),
  "30-day calendar maturity occurs after original V6 approval expiration");
assert.equal(new Date(maturity).getUTCDay(),0,"original 30-day maturity is on Sunday");
assert.equal(continuation.phase,"PREPARATION_NOT_EXECUTION");
assert.equal(continuation.absoluteRestrictions.mayRenewV6Approval,false);
assert.equal(continuation.absoluteRestrictions.mayStageNewProbesAfterOriginalExpiry,false);
assert.equal(approval.liveTradingAllowed,false);
assert.equal(approval.brokerConnectivityAllowed,false);

const clockBeforeExpiry=Date.parse("2026-10-24T21:59:58.000Z");
const clockAfterExpiry=Date.parse("2026-10-24T22:00:00.000Z");
const observerCheckpoint=Date.parse("2026-10-25T21:15:00.000Z");
assert(clockBeforeExpiry<Date.parse(approval.expiresAt));
assert(clockAfterExpiry>Date.parse(approval.expiresAt));
assert(observerCheckpoint>Date.parse(maturity));

const runway=evaluatePaperCampaignRunway({
  campaign,approval,now:Date.parse("2026-10-20T00:00:00Z"),
  cumulativePaperFills:7,
  historicalProbeAttempts:9,
  probesPerDay:new Map(),
});
assert.equal(runway.calendarMaturityAt,maturity);
assert.equal(runway.maturityBeforeApprovalExpiry,false);
assert.equal(runway.postExpiryObservationAllowed,true);
assert.equal(runway.campaignMaturityRequiresActiveApproval,false);
assert.equal(runway.approvalScope,"NEW_PAPER_PROBES_ONLY");

// Observer must run after the exact Sunday milestone, even if GitHub skips
// the weekend PAPER job. No new PAPER attempts are authorized by the observer.
assert.match(workflow,/- cron: "15 21 \* \* \*"/);
assert.doesNotMatch(workflow,/- cron: "15 21 \* \* 1-5"/);
assert.match(workflow,/workflow_run:\n\s+workflows:\n[\s\S]*?-\s+Fenice Paper Validation\n[\s\S]*?-\s+Fenice PAPER Validation Probe Cycle\n[\s\S]*?types:\n\s+-\s+completed/);
const observe=workflow.split("\n  observe:\n")[1]?.split("\n    runs-on:")[0]||"";
assert.ok(observe);
assert.match(observe,/github\.event\.workflow_run\.conclusion == 'success'/);
assert.match(observe,/github\.event\.workflow_run\.head_branch == 'main'/);
assert.match(observe,/github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
assert.match(observe,/github\.event\.workflow_run\.name == 'Fenice Paper Validation'/);
assert.match(observe,/github\.event\.workflow_run\.name == 'Fenice PAPER Validation Probe Cycle'/);
assert.match(observe,/github\.event\.workflow_run\.event == 'schedule'/);
assert.match(observe,/github\.event\.workflow_run\.event == 'workflow_dispatch'/);
assert.match(workflow,/permissions:\n\s+contents: read/);
assert.match(workflow,/cancel-in-progress: false/);
assert.match(workflow,/ref: \$\{\{ github\.event_name == 'workflow_run' && 'main' \|\| github\.sha \}\}/);
assert.match(workflow,/run: node scripts\/report-paper-v6-progress\.mjs/);
assert.match(workflow,/run: node scripts\/test-paper-v6-observer-integrity\.mjs/);
assert.match(workflow,/run: node scripts\/test-paper-v6-observer-orchestration\.mjs/);
assert.match(workflow,/run: \|\n\s+test -z "\$\(git status --porcelain\)"/);
assert.match(workflow,/retention-days: 35/);

console.log("FENICE V6 observation after original approval expiry: PASS; Sunday 30-day milestone observed without new probes or LIVE privileges.");
