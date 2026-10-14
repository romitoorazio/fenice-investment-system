import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = new URL("../.github/workflows/", import.meta.url);
const load = async path => readFile(new URL(path,root),"utf8");
const [shadow,split,promotion,terminal,paper,campaignText] = await Promise.all([
  load("v7-horizon-shadow-evaluation.yml"),
  load("v7-horizon-split.yml"),
  load("v7-shadow-promotion-gate.yml"),
  load("terminal.yml"),
  load("paper-validation.yml"),
  readFile(new URL("../data/paper-validation-campaign.json",import.meta.url),"utf8"),
]);
const yamlHeader = text => text.split(/\npermissions:\s*\n/)[0];
const a = yamlHeader(shadow),b=yamlHeader(split),c=yamlHeader(promotion);
const watcher = a.match(/  workflow_run:\s*\n([\s\S]*?)(?=  pull_request:|  push:|  schedule:|  workflow_dispatch:|\npermissions:)/)?.[1];
assert.ok(watcher, "Shadow evaluator must retain an upstream completion trigger");
assert.match(watcher, /Fenice V7 Horizon Split/);
assert.doesNotMatch(watcher, /Fenice World Terminal/, "Intraday Terminal must not retrigger 7d/30d research");
assert.match(watcher, /types:\s*\n\s+- completed/);
assert.match(a, /cron: "22 23 \* \* 1-5"/, "Daily fallback stays available");
assert.match(a, /workflow_dispatch:/, "Manual repair stays available");
assert.match(a, /pull_request:/, "Code changes must remain testable");
assert.match(a, /push:/, "Code changes on main must remain testable");
assert.match(b, /cron: "7 23 \* \* 1-5"/, "Independent upstream split remains daily");
assert.match(c, /Fenice V7 Shadow Strategy Evaluation/, "Promotion always follows shadow completion");
assert.match(c, /cron: "37 23 \* \* 1-5"/, "Promotion fallback remains daily");
assert.match(yamlHeader(terminal), /Fenice Foundation/, "Terminal still reacts to Foundation");
assert.match(yamlHeader(paper), /cron: "35 16 \* \* 0,6"/, "PAPER audit schedule remains unchanged");
const campaign = JSON.parse(campaignText);
assert.equal(campaign?.liveTradingAllowed,false);
assert.equal(campaign?.baselineFingerprint?.complete,true);
assert.equal(campaign.baselineFingerprint.files.includes(".github/workflows/v7-horizon-shadow-evaluation.yml"),false,
  "This scheduling edit must stay outside the 92-file V6 fingerprint");
assert.match(shadow, /forwardOnly !== true/);
assert.match(shadow, /paperCertificationEvidenceMutationAllowed !== false/);
assert.match(shadow, /brokerSubmissionAllowed !== false/);
assert.match(shadow, /liveTradingAllowed !== false/);
console.log("Fenice V7 daily shadow schedule + PAPER isolation: PASS");
