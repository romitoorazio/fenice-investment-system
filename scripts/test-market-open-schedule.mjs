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
assert.equal(check("unexpected", "2026-10-09T13:45:00.000Z").status, "UNKNOWN_SCHEDULE");
assert.equal(check("45 13 * * 1-5", "2026-10-09T13:40:00.000Z", "workflow_dispatch").status, "NOT_SCHEDULED");
assert.equal(check("", "not-a-date").status, "INVALID_CHECK_TIME");
console.log("Fenice US PAPER scheduled readiness delay regression: PASS.");
