import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = name => readFile(new URL("../.github/workflows/" + name, import.meta.url), "utf8");
const [foundation, ci, paper, engineering] = await Promise.all([
  read("autonomy.yml"), read("ci.yml"), read("paper-validation.yml"),
  read("engineering-validation-evidence.yml"),
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

assert.match(engineering, /Skip repeated evidence commits for unchanged tested code/);
assert.match(engineering, /node scripts\/decide-engineering-evidence-publication\.mjs/);
assert.equal((engineering.match(/steps\.publication\.outputs\.publish == 'true'/g) || []).length, 2,
  "Both evidence generation and persistence must be controlled");
assert.match(engineering, /Confirm tested code still matches main/);
assert.match(engineering, /git merge-base --is-ancestor "\$TESTED_SHA" HEAD/);
assert.ok(!/ignoreCommand|commandForIgnoringBuildStep/.test(foundation + ci + engineering),
  "Ignored Vercel builds still consume deployment quota");
console.log("Fenice Vercel deployment throttling without frozen PAPER changes: PASS");
