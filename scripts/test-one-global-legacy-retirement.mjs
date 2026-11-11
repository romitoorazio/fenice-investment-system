import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { assessLegacyRetirement, inspectLegacyRetirement } from "./verify-one-global-legacy-retirement.mjs";
const read=path=>JSON.parse(readFileSync(path,"utf8"));
const files=[
  [".github/workflows/paper-validation.yml","paper-validation"],
  [".github/workflows/v7-phase-b-forward-paper.yml","paper-forward"],
  [".github/workflows/v7-b2-forward-paper.yml","paper-forward"],
];
const v8=read("data/paper-v8-technical-approval.json");
const fixture={
  manifest:read("data/one-global-legacy-retirement.json"),
  files:Object.fromEntries(files.map(([path])=>[path,readFileSync(path,"utf8")])),
  blobs:Object.fromEntries([
    "data/paper-validation-campaign.json",
    "data/paper-v7-phase-b-approval.json",
    "data/paper-v7-b2-approval.json",
  ].map(path=>[path,execFileSync("git",["rev-parse","HEAD:"+path],{encoding:"utf8"}).trim()])),
  v6:read("data/paper-validation-campaign.json"),
  v7:read("data/paper-v7-phase-b-approval.json"),
  b2:read("data/paper-v7-b2-approval.json"),
  v8,
  v8BlobMap:{...v8.coreFileBlobs},
};
const base=assessLegacyRetirement(fixture);
assert.equal(base.valid,true,JSON.stringify(base));
assert.equal(inspectLegacyRetirement().valid,true);
const edit=(fn)=>{
  const x=structuredClone(fixture);fn(x);
  const result=assessLegacyRetirement(x);
  assert.equal(result.valid,false,JSON.stringify(result));
};
edit(x=>x.manifest.liveTradingAllowed=true);
edit(x=>x.manifest.historicalFillsCreditedToV8=7);
edit(x=>x.manifest.certificationCredit=10);
edit(x=>x.manifest.retainsHistory=false);
edit(x=>x.manifest.renewPreviousApprovals=true);
edit(x=>x.manifest.stopAutomaticLegacyWriters=false);
edit(x=>x.manifest.ownerInstructions=[]);
edit(x=>x.manifest.retiredCampaigns=["V7_B2"]);
edit(x=>x.manifest.legacySourceBlobShas["data/paper-v7-b2-approval.json"]="f".repeat(40));
edit(x=>x.v8.liveTradingAllowed=true);
edit(x=>x.v8.coreFileBlobs[Object.keys(x.v8.coreFileBlobs)[0]]="b".repeat(40));
edit(x=>x.b2.approved=false);
edit(x=>x.blobs["data/paper-validation-campaign.json"]="d".repeat(40));
for(const [path,job] of files){
  edit(x=>{x.files[path]=x.files[path].replace(
    "  "+job+":\n    if: ${{ false }}",
    "  "+job+":\n    if: github.event_name != 'pull_request'");});
}

// ONE GLOBAL retirement must halt all automatic legacy PAPER writers and
// both dispatcher paths; a successful archived workflow is never a V8 proof.
const retiredAutoWriters = [
  [".github/workflows/paper-validation.yml", "paper-validation"],
  [".github/workflows/v7-phase-b-forward-paper.yml", "paper-forward"],
  [".github/workflows/v7-b2-forward-paper.yml", "paper-forward"],
  [".github/workflows/paper-probe-staging.yml", "paper-validation-probe"],
];
for (const [workflowPath, job] of retiredAutoWriters) {
  const source = readFileSync(workflowPath, "utf8");
  assert.doesNotMatch(source, /^  schedule:/m,
    "retired workflow must never consume a daily scheduled runner: " + workflowPath);
  const guardedJob = source.slice(source.indexOf("\n  " + job + ":") + 1);
  assert.match(guardedJob, /^  [\w-]+:\n    if: \$\{\{ false \}\}/,
    "retired PAPER writer must stay hard-disabled: " + workflowPath);
}
for (const workflowPath of [
  ".github/workflows/paper-validation-early-trigger.yml",
  ".github/workflows/paper-probe-operator-trigger.yml",
]) {
  const source = readFileSync(workflowPath, "utf8");
  const gate = source.match(/^  dispatch:\n(?:    #[^\n]*\n)*    if: >-\n([\s\S]*?)\n    runs-on:/m);
  assert.ok(gate, "retired dispatcher condition must exist: " + workflowPath);
  const expression = gate[1].trim().replace(/\s+/g, " ");
  assert.ok(expression.startsWith("false && "),
    "retired dispatcher must start with a literal false gate: " + workflowPath);
  let depth = 0;
  for (let k = 0; k < expression.length; k++) {
    if (expression[k] === "(") depth++;
    if (expression[k] === ")") depth--;
    assert.ok(depth >= 0, "unbalanced dispatcher condition: " + workflowPath);
    assert.ok(!(expression.slice(k, k+2) === "||" && depth === 0),
      "top-level OR could bypass retired dispatcher lock: " + workflowPath);
  }
  assert.equal(depth, 0, "unbalanced dispatcher condition: " + workflowPath);
}

console.log("PASS ONE GLOBAL formal retirement: 16 negative gates; signed ledgers preserved; V8 pinned; no LIVE or broker");
