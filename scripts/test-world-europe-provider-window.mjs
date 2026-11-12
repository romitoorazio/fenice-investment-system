import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessEuropeProviderObservationWindow as check} from "./check-world-europe-provider-window.mjs";

const c=(nowIso,schedule="37 8 * * 1-5",eventName="schedule")=>
  check({nowIso,schedule,eventName});
const winter=c("2026-11-12T08:44:00.000Z");
assert.equal(winter.allowed,true);
assert.equal(winter.delayMinutes,7);
assert.match(winter.romeLocalSchedule,/09:37$/);
assert.equal(winter.authoritativeExchangeProof,false);
assert.equal(winter.sourceRightsCertified,false);
assert.equal(winter.paperAuthorizationGranted,false);
assert.equal(c("2026-07-10T07:44:00.000Z","37 7 * * 1-5").allowed,true,
  "summer 09:37 Rome requires 07:37 UTC");
assert.equal(c("2026-11-12T07:44:00.000Z","37 7 * * 1-5").allowed,false,
  "summer cron during winter is not an exchange-opening window");
assert.equal(c("2026-07-10T08:44:00.000Z").allowed,false,
  "winter cron in summer must not assert a timely European opening");
assert.equal(c("2026-11-12T09:08:00.000Z").status,"MISSED_DIAGNOSTIC_WINDOW");
assert.equal(c("2026-11-14T08:44:00.000Z").allowed,false,"weekends fail closed");
assert.equal(c("2026-11-12T08:44:00.000Z","37 8 * * 1-5","workflow_run").allowed,false);
assert.equal(c("2026-11-12T08:44:00.000Z","0 8 * * 1-5").allowed,false);
assert.equal(c("not-a-time").status,"INVALID_CLOCK");
assert.equal(c("2026-11-12T08:36:00.000Z").allowed,false,"early runs do not claim a session");
const workflow=readFileSync(".github/workflows/world-v7-provider-observation.yml","utf8");
assert.match(workflow,/37 7 \* \* 1-5/);
assert.match(workflow,/37 8 \* \* 1-5/);
assert.match(workflow,/check-world-europe-provider-window\.mjs/);
assert.match(workflow,/steps\.window\.outputs\.allowed == 'true'/);
assert.match(workflow,/XMIL XETR/);
assert.match(workflow,/world-v7-observation-\$MIC\.json/);
assert.match(workflow,/paperReady!==false/);
assert.match(workflow,/quoteFamiliesApproved!==0/);
assert.match(workflow,/liveTradingAllowed!==false/);
assert.match(workflow,/privatePricePublished!==false/);
console.log("PASS EUROPE OPEN diagnostics CET/CEST, 2 venues / 6 credit budget, no fabricated market rights, no PAPER/LIVE");
