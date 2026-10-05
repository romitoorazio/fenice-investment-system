import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAPER_PROBE_RECOVERY_UPSTREAMS } from "./paper-probe-recovery-trigger.mjs";

const workflowPath = ".github/workflows/paper-probe-operator-trigger.yml";
const workflow = readFileSync(workflowPath, "utf8");

const workflowRun = workflow.match(/  workflow_run:\n([\s\S]*?)\n  push:/)?.[1] ?? "";
assert.match(workflowRun, /- Fenice Global Sources\b/, "Global Sources recovery hook is required");
assert.match(workflowRun, /- Fenice Foundation\b/, "Foundation recovery hook is required");
const configuredUpstreams = [...workflowRun.matchAll(/^      - (Fenice .+)$/gm)].map((match) => match[1]);
assert.deepEqual(configuredUpstreams, PAPER_PROBE_RECOVERY_UPSTREAMS, "workflow hooks must match the tested event allow-list");
assert.match(workflowRun, /types:\n\s+- completed\b/, "recovery must only inspect completed upstream runs");

const schedule = workflow.match(/  schedule:\n([\s\S]*?)\n  workflow_run:/)?.[1] ?? "";
const recoveryTimes = [...schedule.matchAll(/cron: "(\d+) (\d+) \* \* 1-5"/g)]
  .map((match) => Number(match[2]) * 60 + Number(match[1]));
assert.equal(recoveryTimes.length, 5, "recovery needs distinct early, middle, late and final quality-recovery opportunities");
assert.ok(recoveryTimes.every((time) => time >= 875 && time <= 1170), "recovery schedules must fit the conservative US window");
assert.ok(recoveryTimes.at(-1) - recoveryTimes[0] >= 180, "nearby schedules must not be the only recovery opportunities");
assert.ok(recoveryTimes.at(-1) >= 1160, "recovery must include a final checkpoint after 19:20 UTC for late quality recovery");

assert.match(workflow, /Checkout trusted main recovery policy[\s\S]*ref: main\n\s+persist-credentials: false/);
assert.match(workflow, /id: trigger_gate\n\s+run: node scripts\/paper-probe-recovery-trigger\.mjs --github-output/);
assert.match(workflow, /name: Verify active fail-closed campaign, evidence age and intelligence quality\n\s+if: steps\.trigger_gate\.outputs\.allowed == 'true'/);
const dispatch = workflow.split("- name: Dispatch canonical PAPER probe cycle")[1]?.split("- name: Confirm fail-closed skip")[0] ?? "";
assert.ok(dispatch.indexOf("--require-allowed") >= 0 && dispatch.indexOf("--require-allowed") < dispatch.indexOf("gh workflow run"),
  "dispatch must repeat actual-time/event validation before sending a canonical probe request");

const requiredFailClosedChecks = [
  'UPSTREAM_EVENT: \${{ github.event.workflow_run.event }}',
  'UPSTREAM_CONCLUSION: \${{ github.event.workflow_run.conclusion }}',
  'UPSTREAM_HEAD_BRANCH: \${{ github.event.workflow_run.head_branch }}',
  'UPSTREAM_HEAD_REPOSITORY: \${{ github.event.workflow_run.head_repository.full_name }}',
  '[ "$UPSTREAM_CONCLUSION" = "success" ]',
  '[ "$UPSTREAM_EVENT" = "schedule" ]',
  '[ "$UPSTREAM_HEAD_BRANCH" = "main" ]',
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
assert.doesNotMatch(workflow, /cooldownReady\s*=\s*ageValid\s*&&\s*ageMinutes\s*>=\s*15/,
  "fresh research quality must not restart the execution-provider cooldown");
assert.match(workflow, /--workflow paper-probe-staging\.yml[^\n]*updatedAt/);
assert.match(workflow, /--workflow paper-validation\.yml[^\n]*updatedAt/);
assert.match(workflow, /execution-market-evidence\.json\?ref=main/);
assert.match(workflow, /node scripts\/paper-probe-cooldown\.mjs --probe-runs[^\n]*--validation-runs[^\n]*--execution-evidence/);
assert.ok(workflow.includes('cooldown_ready="$(jq -r \' .ready\' <<<"$cooldown_metrics")"'.replace("' .ready'", "'.ready'")));
assert.ok(workflow.includes('probe_cycles_today" -lt 2'), "daily provider-cycle cap must stay unchanged");
const regression = readFileSync(".github/workflows/paper-recovery-regression.yml", "utf8");
assert.match(regression, /actions: read/);
assert.doesNotMatch(regression, /actions: write|contents: write|gh workflow run|git push|pull_request_target/);
assert.match(regression, /name: Audit current provider cooldown without dispatch or provider requests\n\s+if: github.event_name != 'pull_request' && github.ref == 'refs\/heads\/main'/);
console.log("PAPER operator recovery config: PASS");
