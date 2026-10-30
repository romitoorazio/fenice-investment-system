import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessV7ForwardDispatch as gate, deriveFallbackV6Event } from "./check-v7-forward-after-v6.mjs";

const nowMs = Date.parse("2026-10-30T17:35:00.000Z");
const valid = {
  nowMs,
  event: {
    repository: { full_name: "romitoorazio/fenice-investment-system" },
    workflow_run: {
      name: "Fenice Paper Validation", conclusion: "success",
      head_branch: "main", head_repository: { full_name: "romitoorazio/fenice-investment-system" },
      event: "workflow_dispatch", updated_at: "2026-10-30T17:34:45.000Z",
    },
  },
  approval: {
    approved: true, humanConfirmation: true, mode: "PAPER",
    liveTradingAllowed: false, brokerConnectivityAllowed: false,
    approvedAt: "2026-10-27T00:00:00.000Z", expiresAt: "2026-11-27T00:00:00.000Z",
    coreFingerprint: { complete: true },
  },
  campaign: { dailyEvidence: [{
    date: "2026-10-30", observedAt: "2026-10-30T17:34:30.000Z",
    marketSession: {
      evidence: { state: "OPEN", authoritative: true },
      decision: { allowed: true }, liveTradingAllowed: false,
      nextClose: "2026-10-30T20:00:00.000Z",
    },
    executionMarketCoverage: {
      ready: true, fresh: true, matchesEvidence: true, policyReady: true,
      broadCoverageReady: true, paperSourceRedundancyReady: true,
      paperEligibleSymbols: 4, paperEligibleSourceFamilies: 2,
    },
    liveTradingAllowed: false, brokerConnectivityAllowed: false, liveOrders: 0,
  }] },
  days: { mode: "V7_PHASE_B_FORWARD_DAYS", days: [] },
  runs: [],
};
const deep = () => structuredClone(valid);
assert.deepEqual(gate(deep()), { dispatch: true, reason: "FRESH_V6_EVIDENCE_AND_ACTIVE_V7_PAPER_APPROVAL" });

const negative = (label, update, reason) => {
  const fixture = deep();
  update(fixture);
  const got = gate(fixture);
  assert.equal(got.dispatch, false, label);
  assert.equal(got.reason, reason, label);
};
negative("wrong source", x => x.event.workflow_run.name = "Unknown", "UNTRUSTED_OR_FAILED_UPSTREAM");
negative("failed upstream", x => x.event.workflow_run.conclusion = "failure", "UNTRUSTED_OR_FAILED_UPSTREAM");
negative("untrusted fork", x => x.event.workflow_run.head_repository.full_name = "fork/repo", "UNTRUSTED_OR_FAILED_UPSTREAM");
negative("wrong branch", x => x.event.workflow_run.head_branch = "feature", "UNTRUSTED_OR_FAILED_UPSTREAM");
negative("untrusted upstream event", x => x.event.workflow_run.event = "pull_request", "UNTRUSTED_OR_FAILED_UPSTREAM");
negative("expired approval", x => x.approval.expiresAt = "2026-10-30T17:00:00.000Z", "V7_APPROVAL_NOT_ACTIVE");
negative("no human approval", x => x.approval.humanConfirmation = false, "V7_APPROVAL_NOT_ACTIVE");
negative("live leak", x => x.approval.liveTradingAllowed = true, "V7_APPROVAL_NOT_ACTIVE");
negative("unpinned core", x => x.approval.coreFingerprint.complete = false, "V7_APPROVAL_NOT_ACTIVE");
negative("stale captured evidence", x => x.campaign.dailyEvidence[0].observedAt = "2026-10-30T16:35:00.000Z", "UPSTREAM_EVIDENCE_OUT_OF_WINDOW");
negative("future captured evidence", x => x.campaign.dailyEvidence[0].observedAt = "2026-10-30T17:36:00.000Z", "UPSTREAM_EVIDENCE_OUT_OF_WINDOW");
negative("wrong evidence day", x => x.campaign.dailyEvidence[0].date = "2026-10-29", "UPSTREAM_EVIDENCE_OUT_OF_WINDOW");
negative("delayed completed source", x => x.event.workflow_run.updated_at = "2026-10-30T17:00:00.000Z", "UPSTREAM_EVIDENCE_OUT_OF_WINDOW");
negative("session closed", x => x.campaign.dailyEvidence[0].marketSession.evidence.state = "CLOSED", "NO_VERIFIED_OPEN_SESSION_TIME");
negative("session untrusted", x => x.campaign.dailyEvidence[0].marketSession.evidence.authoritative = "true", "NO_VERIFIED_OPEN_SESSION_TIME");
negative("near market close", x => x.campaign.dailyEvidence[0].marketSession.nextClose = "2026-10-30T17:50:00.000Z", "NO_VERIFIED_OPEN_SESSION_TIME");
negative("no execution quorum", x => x.campaign.dailyEvidence[0].executionMarketCoverage.paperEligibleSymbols = 2, "V6_MARKET_EVIDENCE_NOT_ELIGIBLE");
negative("unverified source families", x => x.campaign.dailyEvidence[0].executionMarketCoverage.paperEligibleSourceFamilies = 1, "V6_MARKET_EVIDENCE_NOT_ELIGIBLE");
negative("fake live orders", x => x.campaign.dailyEvidence[0].liveOrders = 1, "V6_MARKET_EVIDENCE_NOT_ELIGIBLE");
negative("already filled", x => x.days.days = [{date:"2026-10-30",fillCount:1}], "V7_ALREADY_FILLED_OR_INVALID_LEDGER");
negative("running V7", x => x.runs = [{createdAt:"2026-10-30T17:30:00.000Z",status:"in_progress"}], "V7_RECENT_OR_ACTIVE_RUN");
negative("queued V7", x => x.runs = [{createdAt:"2026-10-30T17:30:00.000Z",status:"queued"}], "V7_RECENT_OR_ACTIVE_RUN");
negative("recent successful V7", x => x.runs = [{createdAt:"2026-10-30T17:30:00.000Z",status:"completed",conclusion:"success"}], "V7_RECENT_OR_ACTIVE_RUN");
negative("invalid clock", x => x.nowMs = Number.NaN, "INVALID_CLOCK");
const old = deep();
old.runs = [{ createdAt:"2026-10-30T16:00:00.000Z",status:"completed",conclusion:"success" }];
assert.equal(gate(old).dispatch, true, "Old unrelated V7 run must not prevent a timely opportunity");
// A missed workflow_run callback can only be recovered by a real, timely,
// successful, main-branch canonical V6 run, never by a JSON snapshot alone.
const completedV6 = {
  status: "completed", conclusion: "success", headBranch: "main",
  event: "workflow_dispatch", updatedAt: "2026-10-30T17:34:45.000Z",
};
const fallbackArgs = { runs: [completedV6], repository: "romitoorazio/fenice-investment-system", nowMs };
const recovered = deriveFallbackV6Event(fallbackArgs);
assert.equal(recovered.workflow_run.name, "Fenice Paper Validation");
assert.deepEqual(gate({ ...deep(), event: recovered }),
  { dispatch: true, reason: "FRESH_V6_EVIDENCE_AND_ACTIVE_V7_PAPER_APPROVAL" });
const badFallback = (patch) =>
  deriveFallbackV6Event({ ...fallbackArgs, runs: [{ ...completedV6, ...patch }] });
assert.equal(badFallback({ conclusion: "failure" }), null, "failed V6 must never launch V7");
assert.equal(badFallback({ status: "in_progress" }), null, "active V6 must never launch V7");
assert.equal(badFallback({ event: "push" }), null, "untrusted event must never launch V7");
assert.equal(badFallback({ headBranch: "feature" }), null, "non-main must never launch V7");
assert.equal(badFallback({ updatedAt: "2026-10-30T16:30:00.000Z" }), null, "stale V6 ignored");
assert.equal(badFallback({ updatedAt: "2026-10-30T17:36:00.000Z" }), null, "future time ignored");
assert.equal(deriveFallbackV6Event({ ...fallbackArgs, repository: "../evil" }), null);
assert.equal(deriveFallbackV6Event({ ...fallbackArgs, runs: [] }), null);
const fallbackExpiredEvidence = deep();
fallbackExpiredEvidence.event = recovered;
fallbackExpiredEvidence.campaign.dailyEvidence[0].observedAt = "2026-10-30T16:30:00.000Z";
assert.equal(gate(fallbackExpiredEvidence).dispatch, false,
  "successful upstream still cannot authorize stale PAPER evidence");
const selected = deriveFallbackV6Event({
  ...fallbackArgs, runs: [
    { ...completedV6, updatedAt: "2026-10-30T17:33:00.000Z" },
    completedV6,
  ],
});
assert.equal(selected.workflow_run.updated_at, completedV6.updatedAt,
  "select latest successful canonical run");

const workflow = readFileSync(resolve(".github/workflows/v7-forward-after-v6.yml"), "utf8");
assert(workflow.includes('workflows: ["Fenice Paper Validation"]'));
assert(workflow.includes("github.event.workflow_run.head_repository.full_name == github.repository"));
assert(workflow.includes("gh workflow run v7-phase-b-forward-paper.yml"));
assert(workflow.includes('cron: "25 18 * * 1-5"'));
assert(workflow.includes("--workflow paper-validation.yml"));
assert(workflow.includes("--fallback-v6-runs"));
assert(workflow.includes("--repository"));
assert(!workflow.includes("npm run marketdata:execution"), "Dispatcher may not consume additional provider quotes");
assert(!workflow.includes("liveTradingAllowed: true"));
console.log("V7 after-PAPER forward dispatch safety: PASS (timing, one-run budget, authorization and no LIVE)");
