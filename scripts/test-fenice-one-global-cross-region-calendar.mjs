import assert from "node:assert/strict";
import { VENUES } from "../lib/global/venue-registry.mjs";
import { evaluateVenueCalendarEvidence } from "../lib/global/venue-session-evidence.mjs";

// Synthetic observations exercise every registered market equally; they are NOT live calendars.
const nowIso = "2026-11-06T10:00:00.000Z";
const zones = new Set();
for (const venue of VENUES) {
  zones.add(venue.zone);
  const observation = {
    mic: venue.mic, zone: venue.zone, sourceId: "synthetic-contract-only",
    authoritative: true, observedAt: "2026-11-06T09:59:30.000Z",
    tradingDay: true, phase: "CONTINUOUS",
    opensAt: "2026-11-06T09:00:00.000Z",
    closesAt: "2026-11-06T11:00:00.000Z",
  };
  const evaluate = (overrides, clock = nowIso) => evaluateVenueCalendarEvidence({
    mic: venue.mic, observation: { ...observation, ...overrides }, nowIso: clock,
  });
  assert.equal(evaluate({}).allowed, true, venue.mic);
  assert.equal(evaluate({ zone: "UTC" }).allowed, false, venue.mic + " zone mismatch");
  assert.equal(evaluate({ authoritative: false }).allowed, false, venue.mic + " authority");
  assert.equal(evaluate({ observedAt: "2026-11-06T09:57:59.000Z" }).reason, "CALENDAR_STALE");
  assert.equal(evaluate({ observedAt: "2026-11-06T10:00:01.000Z" }).reason, "CALENDAR_STALE");
  assert.equal(evaluate({ phase: "LUNCH_BREAK" }).reason, "MARKET_NOT_CONTINUOUS");
  assert.equal(evaluate({ tradingDay: false }).reason, "MARKET_NOT_CONTINUOUS");
  assert.equal(evaluate({ closesAt: "2026-11-06T10:04:59.000Z" }).reason, "OUTSIDE_VERIFIED_SESSION");
  assert.equal(evaluate({ opensAt: "2026-11-06T10:00:01.000Z" }).reason, "OUTSIDE_VERIFIED_SESSION");
}
assert.ok(VENUES.some(v => v.zone.startsWith("Asia/")));
assert.ok(VENUES.some(v => v.zone.startsWith("Europe/")));
assert.ok(VENUES.some(v => v.zone.startsWith("America/")));
console.log(`ONE GLOBAL synthetic cross-region calendar contracts: PASS (${VENUES.length} venues, ${zones.size} zones)`);
