import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PAPER_VALIDATION_CORE_FILES } from "../lib/trading/validation-fingerprint.mjs";

// This validates only scheduling/orchestration. Foundation is scheduled.
// approval, market quote and PAPER evidence workflows are never modified.
const earlyName = ".github/workflows/paper-validation-early-trigger.yml";
const probeName = ".github/workflows/paper-probe-operator-trigger.yml";
for (const name of [earlyName, probeName, "scripts/test-paper-dispatch-fanout-budget.mjs"]) {
  assert.equal(PAPER_VALIDATION_CORE_FILES.includes(name), false,
    name + " must be outside the protected certification fingerprint");
}
const [early, probe, foundation] = await Promise.all([readFile(earlyName,"utf8"), readFile(probeName,"utf8"), readFile(".github/workflows/autonomy.yml","utf8")]);
assert.match(foundation.split(/\npermissions:/)[0], /\n  schedule:\s*\n/,
  "subscribed Foundation must retain a directly scheduled upstream event");
// Preserve Foundation's active feed, but no retired V6 dispatcher should
// subscribe to it or spend even one scheduled runner slot.
for (const [name, source] of [[earlyName, early], [probeName, probe]]) {
  assert.doesNotMatch(source, /^  schedule:/m,
    name + " must have no scheduled legacy recovery");
  assert.doesNotMatch(source, /^  workflow_run:/m,
    name + " must not subscribe to Foundation after retirement");
  assert.match(source, /^  workflow_dispatch:/m,
    name + " retains its inert/manual diagnostic entry point");
  const gate = source.match(/^  dispatch:\n(?:    #[^\n]*\n)*    if: >-\n([\s\S]*?)\n    runs-on:/m);
  assert.ok(gate, "retired dispatcher must have an explicit gate: " + name);
  const expression = gate[1].trim().replace(/\s+/g, " ");
  assert.match(expression, /^false && /,
    "old owner approvals must never reactivate a retired V6 dispatcher: " + name);
  let depth=0;
  for (let k=0;k<expression.length;k++) {
    if (expression[k]==="(") depth++;
    if (expression[k]===")") depth--;
    assert.ok(depth>=0,"unbalanced legacy dispatcher expression: "+name);
    assert.ok(!(depth===0&&expression.slice(k,k+2)==="||"),
      "top-level OR could bypass the archive lock: "+name);
  }
  assert.equal(depth,0,"unbalanced legacy dispatcher expression: "+name);
}
assert.match(early,/after-open-proof:/,"manual read-only audit remains available");
assert.match(early,/github\.event_name == 'workflow_dispatch' && inputs\.audit_only == true/);
assert.match(early,/gh workflow run paper-validation\.yml/,"historical logic remains available for code audits");
assert.match(probe,/gh workflow run paper-probe-staging\.yml/,"historical probe logic remains reviewable");
assert.match(probe,/run_probe == 'true'/,"historical preflight protections remain present");
assert.match(probe,/defer_probe == 'true'/,"historical deferred recheck protections remain present");
console.log("Fenice PAPER recovery fanout budget and V6 isolation: PASS");
