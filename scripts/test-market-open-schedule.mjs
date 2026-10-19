import assert from "node:assert/strict";
import { assessOpenReadinessSchedule, MAX_SCHEDULE_DELAY_MINUTES } from "./verify-market-open-schedule.mjs";

const check = (schedule, now, eventName = "schedule") => assessOpenReadinessSchedule({
  eventName, schedule, now: new Date(now),
});
assert.equal(MAX_SCHEDULE_DELAY_MINUTES, 75);
assert.equal(check("45 13 * * 1-5", "2026-10-09T13:55:00.000Z").status, "ON_TIME");
assert.equal(check("45 14 * * 1-5", "2026-11-09T14:57:00.000Z").status, "ON_TIME");
assert.equal(check("15 16 * * 1-5", "2026-10-09T16:17:00.000Z").status, "ON_TIME");
assert.equal(check("45 13 * * 1-5", "2026-10-08T20:38:52.000Z").status, "MISSED_SCHEDULE_WINDOW");
assert.equal(check("45 14 * * 1-5", "2026-10-09T17:40:00.000Z").ok, false);
assert.equal(check("15 16 * * 1-5", "2026-10-10T16:18:00.000Z").ok, false, "weekend must not appear to be an on-time weekday schedule");
assert.equal(check("15 16 * * 1-5", "2026-10-15T18:38:27.000Z").status,
  "MISSED_SCHEDULE_WINDOW", "observed delayed October 15 schedule must not spend additional provider credits");
assert.equal(check("15 16 * * 1-5", "2026-10-15T16:16:00.000Z").status,
  "ON_TIME", "a timely same-day opening check must still refresh the PAPER quotes");
assert.equal(check("unexpected", "2026-10-09T13:45:00.000Z").status, "UNKNOWN_SCHEDULE");
assert.equal(check("45 13 * * 1-5", "2026-10-09T13:40:00.000Z", "workflow_dispatch").status, "NOT_SCHEDULED");
assert.equal(check("", "not-a-date").status, "INVALID_CHECK_TIME");

const repo = "romitoorazio/fenice-investment-system";
const upstream = {
  name: "Fenice Foundation", event: "schedule", conclusion: "success",
  headBranch: "main", headRepository: repo,
};
function recover(now, overrides = {}, event = "workflow_run") {
  return assessOpenReadinessSchedule({
    eventName: event, now: new Date(now), repository: repo,
    upstream: {...upstream,...overrides},
  });
}
const summer = recover("2026-10-19T14:00:00.000Z");
assert.equal(summer.ok,true);
assert.equal(summer.status,"EARLY_SESSION_RECOVERY_NOT_OPENING_PROOF");
assert.equal(summer.samplingKind,"EARLY_SESSION_RECOVERY_ONLY");
assert.match(summer.exchangeLocalClock,/10:00 America\/New_York/);
assert.equal(recover("2026-10-19T15:17:00.000Z").ok,true);
assert.equal(recover("2026-11-16T15:00:00.000Z").ok,true,"US standard time 10:00 ET");
assert.equal(recover("2026-11-16T14:00:00.000Z").ok,false,"winter 09:00 ET too early");
assert.equal(recover("2026-10-19T13:44:59.000Z").ok,false,"before 09:45 ET");
assert.equal(recover("2026-10-19T15:31:00.000Z").ok,false,"11:31 ET not opening-sample recovery");
assert.equal(recover("2026-10-19T20:19:00.000Z").status,"OUTSIDE_EARLY_SESSION_RECOVERY_WINDOW");
assert.equal(recover("2026-10-18T14:00:00.000Z").ok,false,"NY Sunday");
assert.equal(recover("2026-10-19T14:00:00.000Z",{name:"Fenice Production CI"}).ok,false);
assert.equal(recover("2026-10-19T14:00:00.000Z",{event:"workflow_run"}).ok,false);
assert.equal(recover("2026-10-19T14:00:00.000Z",{conclusion:"failure"}).ok,false);
assert.equal(recover("2026-10-19T14:00:00.000Z",{headBranch:"feature/testing"}).ok,false);
assert.equal(recover("2026-10-19T14:00:00.000Z",{headRepository:"other/repo"}).ok,false);
assert.equal(recover("2026-10-19T14:00:00.000Z",{event:"push"}).ok,true,"trusted Foundation push may recover");
assert.equal(recover("2026-10-19T14:00:00.000Z",{event:"pull_request"}).ok,false);

console.log("Fenice US PAPER scheduled readiness delay regression: PASS.");
