import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyPaperMarketSession,
  evaluatePaperValidationDispatch,
} from "../lib/trading/paper-dispatch-policy.mjs";

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
assert.match(early, /group:\s*fenice-paper-validation-dispatcher/);
assert.match(early, /check-paper-validation-dispatch\.mjs/);
assert.match(early, /steps\.today\.outputs\.should_dispatch == 'true'/);
assert.match(early, /-f dispatch_token=/);
assert.match(early, /cron:\\s*["']5 17 \\* \\* 1-5["']/);
assert.doesNotMatch(early, /push:\s*\n/);
assert.match(operator, /-f dispatch_token=/);

console.log("Fenice PAPER dispatch policy tests passed");
