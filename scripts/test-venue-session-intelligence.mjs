import assert from "node:assert/strict";
import { indicativeVenuePhase, resolveVenueSession, verifyUsPaperClock, VENUE_SCHEDULES } from "../lib/market/venue-session-intelligence.ts";

const now = Date.parse("2026-10-09T14:00:00.000Z"); // 10:00 New York, 16:00 Rome
const freshClock = {
  generatedAt: new Date(now - 2000).toISOString(),
  configured: true,
  liveTradingAllowed: false,
  evidence: {
    venue: "US_EQUITIES",
    state: "OPEN",
    source: "Alpaca Paper Trading Clock",
    observedAt: new Date(now - 1000).toISOString(),
    authoritative: true,
  },
  decision: { allowed: true, state: "OPEN", ageSeconds: 1 },
};
assert.equal(VENUE_SCHEDULES.length, 9, "all nine curated MIC sessions are covered");
assert.equal(indicativeVenuePhase("XNAS", now), "REGULAR_WINDOW");
assert.equal(indicativeVenuePhase("XNYS", now), "REGULAR_WINDOW");
assert.equal(indicativeVenuePhase("ARCX", now), "REGULAR_WINDOW");
assert.equal(indicativeVenuePhase("XNAS", Date.parse("2026-11-09T15:00:00Z")), "REGULAR_WINDOW", "US winter DST transition");
assert.equal(indicativeVenuePhase("XNYS", Date.parse("2026-10-10T14:00:00Z")), "OUTSIDE_REGULAR_WINDOW", "Saturday excluded");
assert.equal(indicativeVenuePhase("XMIL", Date.parse("2026-10-09T15:00:00Z")), "REGULAR_WINDOW", "Rome summer clock");
assert.equal(indicativeVenuePhase("XMIL", Date.parse("2026-10-09T16:00:00Z")), "OUTSIDE_REGULAR_WINDOW", "Milan after regular close");
assert.equal(indicativeVenuePhase("XETR", Date.parse("2026-11-09T12:00:00Z")), "REGULAR_WINDOW");
assert.equal(indicativeVenuePhase("XTKS", Date.parse("2026-10-09T01:00:00Z")), "REGULAR_WINDOW");
assert.equal(indicativeVenuePhase("XTKS", Date.parse("2026-10-09T03:00:00Z")), "OUTSIDE_REGULAR_WINDOW", "Tokyo midday break");
assert.equal(indicativeVenuePhase("XTKS", Date.parse("2026-10-09T04:00:00Z")), "REGULAR_WINDOW");
assert.equal(indicativeVenuePhase("XSHG", Date.parse("2026-10-09T04:00:00Z")), "OUTSIDE_REGULAR_WINDOW", "Shanghai midday break");
assert.equal(indicativeVenuePhase("XSHG", Date.parse("2026-10-09T06:50:00Z")), "REGULAR_WINDOW");
assert.equal(indicativeVenuePhase("XNSE", Date.parse("2026-10-09T05:00:00Z")), "REGULAR_WINDOW");
assert.equal(indicativeVenuePhase("UNKN", now), "UNMAPPED");

const us = resolveVenueSession("XNAS", freshClock, now);
assert.equal(us.state, "OPEN");
assert.equal(us.authoritative, true);
assert.equal(us.paperQuoteRefreshCandidate, true);
assert.deepEqual(us.dataProviderCandidates, ["alpaca", "twelve-data"]);
assert.equal(us.executionAuthorized, false);
assert.equal(us.liveTradingAllowed, false);
assert.equal(resolveVenueSession("XNYS", freshClock, now).state, "OPEN");
assert.equal(resolveVenueSession("ARCX", freshClock, now).state, "OPEN");

const closed = structuredClone(freshClock);
closed.evidence.state = "CLOSED";
closed.decision.state = "CLOSED";
closed.decision.allowed = false;
assert.equal(resolveVenueSession("XNAS", closed, now).state, "CLOSED");
assert.equal(resolveVenueSession("XNAS", closed, now).paperQuoteRefreshCandidate, false);

assert.equal(verifyUsPaperClock(freshClock, now + 180_000).truth, "UNKNOWN", "persisted OPEN must expire within 120s");
assert.equal(verifyUsPaperClock({ ...freshClock, generatedAt: new Date(now - 130_000).toISOString() }, now).truth, "UNKNOWN");
assert.equal(verifyUsPaperClock({ ...freshClock, evidence: { ...freshClock.evidence, observedAt: new Date(now + 130_000).toISOString() } }, now).truth, "UNKNOWN", "future timestamp cannot unlock");
assert.equal(verifyUsPaperClock({ ...freshClock, evidence: { ...freshClock.evidence, source: "manual" } }, now).truth, "UNKNOWN", "untrusted source cannot unlock");
assert.equal(verifyUsPaperClock({ ...freshClock, evidence: { ...freshClock.evidence, venue: "EU_EQUITIES" } }, now).truth, "UNKNOWN");
assert.equal(verifyUsPaperClock({ ...freshClock, decision: { allowed: false, state: "OPEN", ageSeconds: 1 } }, now).truth, "UNKNOWN");
assert.equal(verifyUsPaperClock({ ...freshClock, decision: { allowed: true, state: "OPEN", ageSeconds: "1" } }, now).truth, "UNKNOWN");
assert.equal(verifyUsPaperClock({ ...freshClock, liveTradingAllowed: true }, now).truth, "UNKNOWN");
assert.equal(resolveVenueSession("XNAS", null, now).state, "UNKNOWN", "regular hours never substitute missing exchange evidence");
assert.equal(resolveVenueSession("XMIL", freshClock, now).state, "UNKNOWN", "US clock never certifies Milan");
assert.equal(resolveVenueSession("XMIL", freshClock, now).nextAction, "RESEARCH_ONLY_AWAIT_AUTHORITATIVE_CLOCK");
assert.equal(resolveVenueSession("BVMF", freshClock, now).state, "UNKNOWN", "unmapped exchange remains unknown");
assert.equal(resolveVenueSession("XMIL", freshClock, now).executionAuthorized, false);
assert.deepEqual(resolveVenueSession("XMIL", freshClock, now).dataProviderCandidates, []);
console.log("Fenice global market-session intelligence fail-closed tests: PASS.");
