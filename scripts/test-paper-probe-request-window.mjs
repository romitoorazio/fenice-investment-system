import assert from "node:assert/strict";
import { evaluatePaperProbeRequestWindow } from "./paper-probe-request-window.mjs";

for (const [instant, allowed, label] of [
  ["2026-09-25T13:29:00Z", false, "one minute before EDT open"],
  ["2026-09-25T13:30:00Z", true, "EDT open"],
  ["2026-09-25T19:59:00Z", true, "one minute before EDT close"],
  ["2026-09-25T20:00:00Z", false, "EDT close"],
  ["2026-12-01T14:29:00Z", false, "one minute before EST open"],
  ["2026-12-01T14:30:00Z", true, "EST open"],
  ["2026-12-01T20:59:00Z", true, "one minute before EST close"],
  ["2026-12-01T21:00:00Z", false, "EST close"],
  ["2026-09-26T15:00:00Z", false, "Saturday"],
  ["not-a-date", false, "invalid timestamp"],
]) {
  assert.equal(evaluatePaperProbeRequestWindow(instant).allowed, allowed, label);
}

console.log("Fenice PAPER probe request-window regression: PASS.");
