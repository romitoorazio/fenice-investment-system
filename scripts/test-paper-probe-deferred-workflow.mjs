import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PAPER_VALIDATION_CORE_FILES } from "../lib/trading/validation-fingerprint.mjs";

const workflowPath = ".github/workflows/paper-probe-operator-trigger.yml";
const workflow = await readFile(workflowPath, "utf8");

const changedOperationalFiles = [
  workflowPath,
  "scripts/paper-probe-deferred-recheck.mjs",
  "scripts/test-paper-probe-deferred-recheck.mjs",
  "scripts/test-paper-probe-deferred-workflow.mjs",
  ".github/workflows/paper-probe-deferred-recheck.yml",
];
for (const file of changedOperationalFiles) {
  assert.equal(
    PAPER_VALIDATION_CORE_FILES.includes(file),
    false,
    `deferred recheck optimization must remain outside frozen V6 fingerprint: ${file}`,
  );
}

assert.match(workflow, /timeout-minutes:\s*25/);
assert.match(workflow, /node scripts\/test-paper-probe-deferred-recheck\.mjs/);
assert.match(workflow, /defer_metrics=.*paper-probe-deferred-recheck\.mjs/);
assert.match(workflow, /defer_probe=\$defer_probe/);
assert.match(workflow, /defer_wait_seconds=\$defer_wait_seconds/);
assert.match(workflow, /WAIT_SECONDS: \$\{\{ steps\.preflight\.outputs\.defer_wait_seconds \}\}/);
assert.match(workflow, /\[ "\$WAIT_SECONDS" -gt 905 \]/);
assert.match(workflow, /gh workflow run paper-probe-operator-trigger\.yml --repo "\$GITHUB_REPOSITORY" --ref main/);
assert.match(workflow, /steps\.preflight\.outputs\.run_probe != 'true' && steps\.preflight\.outputs\.defer_probe != 'true'/);

const deferredStepStart = workflow.indexOf("- name: Dispatch one deferred operator recheck");
const failClosedStart = workflow.indexOf("- name: Confirm fail-closed skip");
assert(deferredStepStart >= 0 && failClosedStart > deferredStepStart);
const deferredStep = workflow.slice(deferredStepStart, failClosedStart);
assert.match(deferredStep, /paper-probe-operator-trigger\.yml/);
assert.doesNotMatch(
  deferredStep,
  /paper-probe-staging\.yml/,
  "deferred path must re-run preflight instead of dispatching canonical staging directly",
);

const directStepStart = workflow.indexOf("- name: Dispatch canonical PAPER probe cycle");
const waitStepStart = workflow.indexOf("- name: Wait only for remaining provider cooldown");
assert(directStepStart >= 0 && waitStepStart > directStepStart);
const directStep = workflow.slice(directStepStart, waitStepStart);
assert.match(
  directStep,
  /paper-probe-staging\.yml/,
  "normal ready path must continue to use the canonical fingerprinted stager",
);

console.log("Fenice PAPER deferred recheck workflow invariants: PASS; V6 fingerprint surface unchanged.");
