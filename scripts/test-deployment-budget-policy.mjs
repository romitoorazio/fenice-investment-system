import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const read = name => readFile(new URL("../.github/workflows/" + name, import.meta.url), "utf8");
const [foundation, ci, paper, engineering, redundantFoundation, dataLab, release] = await Promise.all([
  read("autonomy.yml"), read("ci.yml"), read("paper-validation.yml"),
  read("engineering-validation-evidence.yml"), read("fenice-x.yml"),
  read("market-data-validation-lab.yml"), read("vercel-deploy.yml"),
]);
const header = source => source.split(/\npermissions:\s*\n/)[0];

// Only *non-fingerprinted* workflows can change during the live PAPER V6 window.
assert.ok(header(foundation).includes('cron: "17 */3 * * *"'));
assert.ok(header(foundation).includes('cron: "37 5 * * *"'));
assert.ok(!header(foundation).includes('cron: "17 * * * *"'));
assert.ok(header(ci).includes('cron: "47 * * * *"'), "Frozen CI schedule must be unchanged");
assert.ok(header(ci).includes('"data/history/**"'));
assert.ok(!header(ci).includes('"data/**"'));
assert.ok(header(ci).includes("pull_request:"));
assert.ok(header(ci).includes("push:"));
assert.ok(header(paper).includes('cron: "35 16 * * 0,6"'));

// Fenice X invokes the same npm foundation job; repeated scheduled runs
// double provider requests, compete for writer locks, and add data commits.
// Keep manual disaster-recovery entrypoint, not another automatic collector.
assert.match(header(redundantFoundation), /workflow_dispatch:/);
assert.doesNotMatch(header(redundantFoundation), /(?:^|\n)  schedule:/);
assert.doesNotMatch(header(redundantFoundation), /(?:^|\n)  push:/);
assert.match(redundantFoundation, /run: npm run foundation/);
assert.match(foundation, /run: npm run foundation/);

// Audit observation remains available after scheduled Intelligence Quality,
// by operator dispatch and as a regression on lab-code changes.
assert.match(header(dataLab), /workflows: \[Fenice Intelligence Quality\]/);
assert.doesNotMatch(header(dataLab), /workflows:.*Fenice Foundation/);
assert.match(header(dataLab), /workflow_dispatch:/);
assert.match(header(dataLab), /pull_request:/);
assert.match(dataLab, /run: node scripts\/run-market-data-validation-lab\.mjs/);

assert.match(engineering, /Skip repeated evidence commits for unchanged tested code/);
assert.match(engineering, /node scripts\/decide-engineering-evidence-publication\.mjs/);
assert.equal((engineering.match(/steps\.publication\.outputs\.publish == 'true'/g) || []).length, 2,
  "Both evidence generation and persistence must be controlled");
assert.match(engineering, /Confirm tested code still matches main/);
assert.match(engineering, /git merge-base --is-ancestor "\$TESTED_SHA" HEAD/);
assert.ok(!/ignoreCommand|commandForIgnoringBuildStep/.test(foundation + ci + engineering),
  "Ignored Vercel builds still consume deployment quota");

const releaseContinuationLines = release.split("\n").filter(line => /\\+$/.test(line));
assert(releaseContinuationLines.length > 0, "guarded release retains multiline shell commands");
assert(releaseContinuationLines.every(line => (line.match(/\\+$/) || [""])[0].length === 1),
  "double-escaped shell line continuation corrupts curl headers and Vercel URL");
const shellBlocks=[...release.matchAll(/^        run: \|\n((?:          [^\n]*(?:\n|$)|\n)*)/gm)];
assert(shellBlocks.length>0,"Release must expose reviewable shell steps");
for(const [,block] of shellBlocks){
  const parsed=spawnSync("bash",["-n"],{input:block.split("\n").map(line=>line.startsWith("          ")?line.slice(10):line).join("\n"),encoding:"utf8"});
  assert.equal(parsed.status,0,parsed.stderr);
}
assert.match(release, /gitSource:[\s\S]*?sha: \$sha/,
  "production deployment must remain bound to an exact Git commit SHA");
assert.match(release, /This exact main SHA already has a READY production deployment/,
  "duplicate deployments must still be prevented");
assert.match(release, /Manual dispatch is dry-run only/,
  "manual bypass of the guarded deployment request must remain disabled");
assert.match(release, /Verify production alias points to the new Fenice deployment/,
  "deployment must verify that production alias reaches the exact created deployment");
assert.match(release, /liveTradingReleased == false/,
  "public read-only broker safety contract must remain enforced");
console.log("Fenice Vercel deployment throttling without frozen PAPER changes: PASS");
