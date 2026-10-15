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
function upstreams(source) {
  const header=source.split(/\npermissions:/)[0];
  const section=header.match(/\n  workflow_run:\s*\n([\s\S]*?)\n  (?:workflow_dispatch:|push:|schedule:)/);
  assert(section, "workflow_run should remain before another event section");
  const list=section[1].match(/(?:^|\n)    workflows:[ \t]*\n([\s\S]*?)\n    types:/);
  assert(list,"workflow_run must have an explicit upstream list");
  return [...list[1].matchAll(/^\s+-\s+["']?([^"'\n]+?)["']?\s*$/gm)].map(x=>x[1].trim());
}
for(const [name,source,minimumSchedules] of [
  [earlyName,early,7],[probeName,probe,5],
]){
  assert.deepEqual(upstreams(source),["Fenice Foundation"],
    name+" must subscribe to just one trusted completed upstream");
  assert.match(source,/workflow_dispatch:/,"manual recovery must remain available");
  assert.match(source,/head_branch == 'main'/,"main-only upstream check must remain");
  assert.match(source,/head_repository\.full_name == github\.repository/,"foreign upstream blocked");
  assert.match(source,/conclusion == 'success'/,"failed upstreams blocked");
  const schedule=source.match(/\n  schedule:\s*\n([\s\S]*?)\n  (?:workflow_run:|push:|workflow_dispatch:)/);
  assert(schedule,"independent recovery crons must remain");
  const times=[...schedule[1].matchAll(/- cron:\s*["']([^"']+)["']/g)].map(x=>x[1]);
  assert(times.length >= minimumSchedules,name+" cron fallback must not be weakened");
}
assert.match(early,/gh workflow run paper-validation\.yml/,"daily canonical V6 workflow retained");
assert.match(probe,/gh workflow run paper-probe-staging\.yml/,"canonical probe stager retained");
assert.match(probe,/run_probe == 'true'/,"only preflight-eligible probes dispatch");
assert.match(probe,/defer_probe == 'true'/,"bounded deferred recheck retained");
console.log("Fenice PAPER recovery fanout budget and V6 isolation: PASS");
