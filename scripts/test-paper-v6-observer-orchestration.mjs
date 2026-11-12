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

// The original 30-day Sunday checkpoint is in the past. V6 expired,
// the WRITERS have been retired, and the historical kill switch must stay
// observable only by a deliberate manual forensic run. No automatic fanout.
assert.match(workflow, /^  workflow_dispatch:/m,
  "manual forensic observer must remain available");
assert.doesNotMatch(workflow, /^  schedule:/m,
  "retired V6 observer must not run every day and generate obsolete failures");
assert.doesNotMatch(workflow, /^  workflow_run:/m,
  "retired V6 must not subscribe to old canonical/probe completions");
const observe=workflow.split("\n  observe:\n")[1]?.split("\n    runs-on:")[0]||"";
assert.ok(observe);
assert.match(observe, /if: github\.event_name == 'workflow_dispatch'/);
const regression=workflow.split("\n  regression:\n")[1]?.split("\n  observe:\n")[0]||"";
assert.ok(regression);
assert.match(regression, /github\.event_name == 'pull_request' \|\| github\.event_name == 'push'/);
assert.match(regression, /node scripts\/test-one-global-legacy-retirement\.mjs/);
assert.match(regression, /node scripts\/test-paper-v6-observer-integrity\.mjs/);
assert.doesNotMatch(regression, /node scripts\/report-paper-v6-progress\.mjs/,
  "routine PR/push regression must never re-evaluate an archived V6 alert");
assert.match(workflow, /ref: main\n\s+persist-credentials: false/,
  "manual archived forensic audit must run trusted main without persisted credentials");
assert.match(workflow,/permissions:\n\s+contents: read/);
assert.match(workflow,/cancel-in-progress: false/);

assert.match(workflow,/run: node scripts\/report-paper-v6-progress\.mjs/);
assert.match(workflow,/run: node scripts\/test-paper-v6-observer-integrity\.mjs/);
assert.match(workflow,/run: node scripts\/test-paper-v6-observer-orchestration\.mjs/);
assert.match(workflow,/run: \|\n\s+test -z "\$\(git status --porcelain\)"/);
assert.match(workflow,/retention-days: 35/);

console.log("FENICE retired V6 observer: manual-only forensic audit, no automatic dispatch, immutable history and LIVE lock PASS.");
