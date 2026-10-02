import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflowPath = ".github/workflows/paper-probe-operator-trigger.yml";
const workflow = readFileSync(workflowPath, "utf8");

const workflowRun = workflow.match(/  workflow_run:\n([\s\S]*?)\n  push:/)?.[1] ?? "";
assert.match(workflowRun, /- Fenice Global Sources\b/, "Global Sources recovery hook is required");
assert.match(workflowRun, /- Fenice Foundation\b/, "Foundation recovery hook is required");
assert.match(workflowRun, /types:\n\s+- completed\b/, "recovery must only inspect completed upstream runs");

const requiredFailClosedChecks = [
  'UPSTREAM_EVENT: \${{ github.event.workflow_run.event }}',
  'UPSTREAM_CONCLUSION: \${{ github.event.workflow_run.conclusion }}',
  '[ "$UPSTREAM_CONCLUSION" = "success" ]',
  '[ "$UPSTREAM_EVENT" = "schedule" ]',
  '[ "$utc_weekday" -le 5 ]',
  '[ "$utc_minutes" -ge 875 ]',
  '[ "$utc_minutes" -le 1170 ]',
  '[ "$active" = "true" ]',
  '[ "$attempted_today" != "true" ]',
  '[ "$active_probe_run" != "true" ]',
  '[ "$probe_cycle_budget_ready" = "true" ]',
  'request_window_ready=false',
  '[ "$request_window_ready" = "true" ]',
  'echo "request_window_ready=$request_window_ready"',
  '[ "$cooldown_ready" = "true" ]',
  '[ "$quality_ready" = "true" ]',
  '[ "$sources_ready" = "true" ]',
  'gh workflow run paper-probe-staging.yml',
  '--ref main',
];

for (const check of requiredFailClosedChecks) {
  assert.ok(workflow.includes(check), "missing fail-closed recovery control: " + check);
}

const requestWindowIndex = workflow.indexOf('request_window_ready=false');
const eventSpecificIndex = workflow.indexOf('if [ "$EVENT_NAME" = "workflow_run" ]');
assert.ok(requestWindowIndex >= 0 && eventSpecificIndex >= 0 && requestWindowIndex < eventSpecificIndex,
  "market recovery window must guard schedule, workflow_run and manual triggers before event-specific checks");

assert.doesNotMatch(workflow, /liveTradingAllowed\s*=\s*true|brokerConnectivityAllowed\s*=\s*true/);
console.log("PAPER operator recovery config: PASS");
