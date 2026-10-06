import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluatePaperValidationEventRecovery } from "./paper-validation-event-recovery-trigger.mjs";

const repository = "romitoorazio/fenice-investment-system";
const goodUpstream = {
  name: "Fenice Production CI",
  event: "schedule",
  conclusion: "success",
  headBranch: "main",
  headRepository: repository,
};

function evaluate(overrides = {}) {
  return evaluatePaperValidationEventRecovery({
    now: new Date("2026-10-05T17:10:00.000Z"),
    eventName: "workflow_run",
    repository,
    upstream: { ...goodUpstream },
    ...overrides,
  });
}

assert.deepEqual(evaluate(), { allowed: true, reason: "eligible-daily-evidence-recovery-trigger" });
assert.equal(evaluate({ now: new Date("2026-10-05T17:04:59.000Z") }).allowed, false);
assert.equal(evaluate({ now: new Date("2026-10-05T19:31:00.000Z") }).allowed, false);
assert.equal(evaluate({ now: new Date("2026-10-04T17:10:00.000Z") }).allowed, false);
assert.equal(evaluate({ eventName: "push" }).allowed, false);
assert.deepEqual(
  evaluate({ upstream: { ...goodUpstream, event: "push" } }),
  { allowed: true, reason: "eligible-daily-evidence-recovery-trigger" },
);
assert.equal(evaluate({ upstream: { ...goodUpstream, event: "workflow_dispatch" } }).allowed, false);
assert.equal(evaluate({ upstream: { ...goodUpstream, event: "push", name: "Fenice World Terminal" } }).allowed, false);
assert.equal(evaluate({ upstream: { ...goodUpstream, conclusion: "failure" } }).allowed, false);
assert.equal(evaluate({ upstream: { ...goodUpstream, headBranch: "feature/test" } }).allowed, false);
assert.equal(evaluate({ upstream: { ...goodUpstream, headRepository: "other/repo" } }).allowed, false);
assert.equal(evaluate({ upstream: { ...goodUpstream, name: "Unknown workflow" } }).allowed, false);

const workflow = readFileSync(".github/workflows/paper-validation-early-trigger.yml", "utf8");
assert.match(workflow, /github\.event_name != 'workflow_run'[\s\S]*github\.event\.workflow_run\.conclusion == 'success'[\s\S]*github\.event\.workflow_run\.head_branch == 'main'[\s\S]*github\.event\.workflow_run\.head_repository\.full_name == github\.repository/,
  "early trigger must reject cross-repository or non-main workflow_run events before runner work");
assert.match(workflow, /github\.event\.workflow_run\.event == 'schedule'[\s\S]*github\.event\.workflow_run\.event == 'push'[\s\S]*github\.event\.workflow_run\.name == 'Fenice Production CI'/,
  "early trigger must preserve scheduled upstreams and trusted Production CI push recovery only");

console.log("paper validation event recovery trigger tests: PASS");
