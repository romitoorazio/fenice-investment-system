import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyPaperMarketSession,
  evaluatePaperValidationDispatch,
} from "../lib/trading/paper-dispatch-policy.mjs";
import { evaluatePaperDispatchRateGuard } from "../lib/trading/paper-dispatch-rate-guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = Date.parse("2026-12-01T14:35:00.000Z");
const safeRow = {
  date: "2026-12-01",
  observedAt: "2026-12-01T13:36:00.000Z",
  liveOrders: 0,
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
  auditChainValid: true,
  reconciliationBalanced: true,
  reconciliationBreaks: 0,
  validationFingerprint: { algorithm: "sha256", complete: true },
};

function session({ state, observedAt, nextOpen, allowed = false, authoritative = true }) {
  return {
    configured: true,
    generatedAt: observedAt,
    evidence: { state, observedAt, authoritative, venue: "US_EQUITIES" },
    decision: { allowed, state },
    nextOpen,
    liveTradingAllowed: false,
  };
}

const preOpen = session({
  state: "CLOSED",
  observedAt: "2026-12-01T13:35:00.000Z",
  nextOpen: "2026-12-01T14:30:00.000Z",
});
const open = session({
  state: "OPEN",
  observedAt: "2026-12-01T14:35:00.000Z",
  nextOpen: "2026-12-02T14:30:00.000Z",
  allowed: true,
});
const holiday = session({
  state: "CLOSED",
  observedAt: "2026-12-01T14:35:00.000Z",
  nextOpen: "2026-12-02T14:30:00.000Z",
});

assert.equal(classifyPaperMarketSession(preOpen, "2026-12-01"), "PRE_OPEN");
assert.equal(classifyPaperMarketSession(open, "2026-12-01"), "OPEN");
assert.equal(classifyPaperMarketSession(holiday, "2026-12-01"), "CLOSED_FINAL");
assert.equal(classifyPaperMarketSession({ ...open, configured: false }, "2026-12-01"), "UNKNOWN");

const preOpenRetry = evaluatePaperValidationDispatch({
  campaign: { dailyEvidence: [{ ...safeRow, marketSession: preOpen }] },
  marketSession: preOpen,
  workflowRuns: [],
  now,
});
assert.equal(preOpenRetry.shouldDispatch, true);
assert.equal(preOpenRetry.sessionPhase, "PRE_OPEN");

const openComplete = evaluatePaperValidationDispatch({
  campaign: { dailyEvidence: [{ ...safeRow, marketSession: open }] },
  marketSession: open,
  workflowRuns: [],
  now,
});
assert.equal(openComplete.shouldDispatch, false);
assert.equal(openComplete.finalEvidenceToday, true);

const holidayComplete = evaluatePaperValidationDispatch({
  campaign: { dailyEvidence: [{ ...safeRow, marketSession: holiday }] },
  marketSession: holiday,
  workflowRuns: [],
  now,
});
assert.equal(holidayComplete.shouldDispatch, false);

const activeRun = evaluatePaperValidationDispatch({
  campaign: { dailyEvidence: [] },
  marketSession: {},
  workflowRuns: [{ databaseId: 42, status: "in_progress" }],
  now,
});
assert.equal(activeRun.shouldDispatch, false);
assert.deepEqual(activeRun.activeRunIds, [42]);

const completedRun = evaluatePaperValidationDispatch({
  campaign: { dailyEvidence: [] },
  marketSession: {},
  workflowRuns: [{ databaseId: 43, status: "completed" }],
  now,
});
assert.equal(completedRun.shouldDispatch, true);
const completedToday = (length) => Array.from({ length }, (_, index) => ({
  databaseId: index + 50,
  status: "completed",
  createdAt: "2026-12-01T" + String(15 + index).padStart(2, "0") + ":00:00Z",
}));
const exhaustedAuto = evaluatePaperDispatchRateGuard({
  today: "2026-12-01", workflowRuns: completedToday(4),
});
assert.equal(exhaustedAuto.exhausted, true, "4 failed/completed runs must stop automated retries");
assert.equal(exhaustedAuto.dailyCount, 4);
assert.equal(evaluatePaperDispatchRateGuard({today:"2026-12-01",workflowRuns:completedToday(3)}).exhausted,false);
assert.equal(evaluatePaperDispatchRateGuard({today:"2026-12-02",workflowRuns:completedToday(4)}).exhausted,false,
  "yesterday retry budget must not suppress tomorrow");
assert.equal(evaluatePaperDispatchRateGuard({today:"2026-12-01",
  workflowRuns:[...completedToday(2),{status:"queued",createdAt:"2026-12-01T19:00:00Z"}]}).dailyCount,3);
assert.throws(()=>evaluatePaperDispatchRateGuard({today:"bad-date",workflowRuns:[]}),/INVALID_PAPER_DISPATCH_DAY/);

const unsafeOpenRow = evaluatePaperValidationDispatch({
  campaign: { dailyEvidence: [{ ...safeRow, auditChainValid: false, marketSession: open }] },
  marketSession: open,
  workflowRuns: [],
  now,
});
assert.equal(unsafeOpenRow.shouldDispatch, true);

const [canonical, probe, bootstrap, early, operator] = await Promise.all([
  readFile(path.join(root, ".github/workflows/paper-validation.yml"), "utf8"),
  readFile(path.join(root, ".github/workflows/paper-probe-staging.yml"), "utf8"),
  readFile(path.join(root, ".github/workflows/paper-validation-bootstrap-v2.yml"), "utf8"),
  readFile(path.join(root, ".github/workflows/paper-validation-early-trigger.yml"), "utf8"),
  readFile(path.join(root, ".github/workflows/paper-probe-operator-trigger.yml"), "utf8"),
]);

for (const [name, workflow] of [["canonical", canonical], ["probe", probe]]) {
  assert.match(workflow, /run-name:[^\n]*dispatch_token/);
  assert.match(workflow, /dispatch_token:/);
  assert.match(workflow, /required:\s*false/);
  assert.doesNotMatch(workflow, /push:\s*\n/);
  assert.ok(workflow.length > 100, `${name} workflow unexpectedly empty`);
}
assert.match(bootstrap, /group:\s*fenice-paper-validation-dispatcher/);
assert.match(bootstrap, /-f dispatch_token=/);
assert.match(bootstrap, /displayTitle/);
assert.doesNotMatch(bootstrap, /before=/);
assert.doesNotMatch(bootstrap, /push:\s*\n/);
// Historical dispatch algorithms stay testable, but the retired V6 pipeline
// must have no automatically scheduled or subscribed recovery entry point.
assert.match(early, /group:\s*fenice-paper-validation-dispatcher/);
assert.match(early, /workflow_dispatch:/);
assert.match(early, /audit_only:/);
assert.match(early, /after-open-proof:/);
assert.match(early, /github\.event_name == 'workflow_dispatch' && inputs\.audit_only == true/);
assert.doesNotMatch(early, /^  schedule:/m);
assert.doesNotMatch(early, /^  workflow_run:/m);
assert.doesNotMatch(early, /^  push:/m);
assert.match(early, /^  dispatch:\n(?:    #[^\n]*\n)*    if: >-\n      false &&/m,
  "retired daily V6 dispatcher must be permanently disabled");
assert.doesNotMatch(operator, /^  schedule:/m);
assert.doesNotMatch(operator, /^  workflow_run:/m);
assert.match(operator, /^  dispatch:\n(?:    #[^\n]*\n)*    if: >-\n      false &&/m,
  "retired V6 probe dispatcher must be permanently disabled");
assert.match(operator, /-f dispatch_token=/);

console.log("Fenice PAPER dispatch policy tests passed");
