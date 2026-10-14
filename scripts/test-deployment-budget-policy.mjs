import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const get = async name => readFile(new URL("../.github/workflows/" + name, import.meta.url), "utf8");
const [foundation, ci, paper] = await Promise.all([
  get("autonomy.yml"), get("ci.yml"), get("paper-validation.yml"),
]);
const trigger = source => source.split(/\npermissions:\s*\n/)[0];

assert.match(trigger(foundation), /cron: "17 \\/3 \\* \\* \\*"/, "Foundation must not rebuild hourly");
assert.match(trigger(foundation), /cron: "37 5 \\* \\* \\*"/, "Keep daily full research refresh");
assert.doesNotMatch(trigger(foundation), /cron: "17 \\* \\* \\* \\*"/);

assert.match(trigger(ci), /cron: "47 5,11,17,23 \\* \\* \\*"/);
assert.doesNotMatch(trigger(ci), /cron: "47 \\* \\* \\* \\*"/);
assert.match(trigger(ci), /pull_request:/, "Every code PR must receive CI");
assert.match(trigger(ci), /push:/, "Code changes on main must receive CI");
assert.match(trigger(ci), /workflow_dispatch:/, "Operator can always request CI");

const ignored = trigger(ci).split("paths-ignore:")[1]?.split("\n  pull_request:")[0] || "";
assert.ok(ignored, "Data output exceptions are required");
assert.doesNotMatch(ignored, /^\s*- ["']?data\/\*\*/m, "Never blanket-ignore protected PAPER files");
assert.match(ignored, /data\/v7-\*\.json/);
assert.match(ignored, /data\/engineering-validation-evidence\.json/);
assert.match(ignored, /data\/history\/\*\*/);
assert.match(ignored, /\*\*\/\*\.md/);

// GitHub minimatch semantics for the deliberately bounded patterns above:
// ignore lists must not match safety-critical datasets.
const patterns = [...ignored.matchAll(/^\s*- "([^"]+)"\s*$/gm)].map(match => match[1]);
function matches(path, glob) {
  if (glob === "data/**") return path.startsWith("data/");
  if (glob.endsWith("/**")) return path.startsWith(glob.slice(0, -3) + "/");
  if (glob.endsWith("*.json")) return path.startsWith(glob.slice(0, -6)) && path.endsWith(".json");
  return path === glob;
}
const protectedPaths = [
  "data/paper-validation-campaign.json",
  "data/paper-validation-approval.json",
  "data/paper-oms-state.json",
  "data/paper-fx-evidence.json",
  "data/paper-market-session.json",
  "data/execution-market-evidence.json",
  "data/execution-market-coverage.json",
];
for (const path of protectedPaths) {
  assert.ok(!patterns.some(glob => matches(path,glob)), "PAPER/execution changes must trigger CI: " + path);
}
assert.match(trigger(paper), /cron: "35 16 \\* \\* 0,6"/, "Weekend PAPER evidence schedule retained");
assert.ok(!/ignoreCommand|commandForIgnoringBuildStep/.test(foundation + ci), "An ignored Vercel build still consumes the deployment quota");
console.log("Fenice deployment quota workflow budget and PAPER isolation: PASS");
