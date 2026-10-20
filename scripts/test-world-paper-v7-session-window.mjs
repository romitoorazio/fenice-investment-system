import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const workflow = readFileSync(new URL("../.github/workflows/world-paper-v7.yml", import.meta.url), "utf8");
const observer = readFileSync(new URL("./run-world-paper-v7.mjs", import.meta.url), "utf8");
const campaign = JSON.parse(readFileSync(new URL("../data/paper-validation-campaign.json", import.meta.url), "utf8"));
const crons = [...workflow.matchAll(/cron: "([^"]+)"/g)].map(x => x[1]);
assert.deepEqual(crons, ["05 2 * * 1-5", "35 8 * * 1-5", "35 15 * * 1-5", "35 19 * * 1-5"]);
// 02:05 UTC -> 11:05 Japan (before 11:30 lunch); 08:35 UTC ->
// 09:35 CET winter / 10:35 CEST summer (during Italian continuous trading).
// Venue holidays and independently authoritative OPEN proofs are still required.
assert.match(workflow, /Schedules are never proof/);
assert.match(observer, /sessions: \[\], quotes: \[\], fx: \[\]/);
assert.match(observer, /paperRunAuthorized: false/);
assert.match(observer, /simulatedFills:/);
assert.equal(campaign.liveTradingAllowed, false);
assert.equal(campaign.baselineFingerprint.complete, true);
assert.equal(campaign.baselineFingerprint.files.includes(".github/workflows/world-paper-v7.yml"), false);
console.log("World V7 early Asia-Europe observation windows and V6 isolation: PASS");
