import assert from "node:assert/strict";
import { getEuropeanOfficialCalendarStatus } from "../lib/market/europe-official-calendar-2026.ts";
import { resolveVenueSession, indicativeVenuePhase } from "../lib/market/venue-session-intelligence.ts";

const instant = (s) => Date.parse(s);
const calendar = (mic, iso) => getEuropeanOfficialCalendarStatus(mic, instant(iso));
const venue = (mic, iso) => resolveVenueSession(mic, null, instant(iso));
const regular = "2026-10-09T10:30:00.000Z";
for (const mic of ["XMIL", "XPAR", "XETR"]) {
  const status = calendar(mic, regular);
  assert.equal(status.state, "NO_LISTED_CLOSURE", `${mic} ordinary October Friday`);
  assert.equal(status.verifiedAnnualCalendar, true);
  assert.equal(status.provesExchangeOpen, false);
  assert.equal(status.authorizesOrders, false);
  const market = venue(mic, regular);
  assert.equal(market.state, "UNKNOWN", "calendar may NEVER attest live market opening");
  assert.equal(market.authoritative, false);
  assert.equal(market.paperQuoteRefreshCandidate, false);
  assert.equal(market.executionAuthorized, false);
  assert.equal(market.liveTradingAllowed, false);
  assert.equal(market.calendarState, "NO_LISTED_CLOSURE");
  assert.equal(market.indicativePhase, "REGULAR_WINDOW");
}

for (const iso of [
  "2026-01-01T11:00:00Z",
  "2026-04-03T11:00:00Z",
  "2026-04-06T11:00:00Z",
  "2026-05-01T11:00:00Z",
  "2026-12-25T11:00:00Z",
]) {
  for (const mic of ["XMIL", "XPAR", "XETR"]) {
    assert.equal(calendar(mic, iso).state, "OFFICIAL_CLOSED", `${mic} holiday ${iso}`);
    assert.equal(venue(mic, iso).calendarHolidayVerified, true);
    assert.equal(venue(mic, iso).indicativePhase, "OUTSIDE_REGULAR_WINDOW");
    assert.equal(venue(mic, iso).nextAction, "RESEARCH_ONLY_OFFICIAL_CALENDAR_CLOSED");
  }
}
// Milan and Xetra are completely closed on Christmas Eve and 31 Dec;
// Paris reports shortened sessions instead, without published per-asset
// full closing time: never claim a standard regular trading window.
for (const iso of ["2026-12-24T10:00:00Z", "2026-12-31T10:00:00Z"]) {
  assert.equal(calendar("XMIL", iso).state, "OFFICIAL_CLOSED");
  assert.equal(calendar("XETR", iso).state, "OFFICIAL_CLOSED");
  const paris = venue("XPAR", iso);
  assert.equal(paris.calendarState, "SPECIAL_HOURS_UNCONFIRMED");
  assert.equal(paris.state, "UNKNOWN");
  assert.equal(paris.nextAction, "RESEARCH_ONLY_SPECIAL_HOURS");
  assert.equal(paris.paperQuoteRefreshCandidate, false);
}
const xetraSpecial = venue("XETR", "2026-12-30T10:00:00Z");
assert.equal(xetraSpecial.calendarState, "SPECIAL_HOURS_UNCONFIRMED");
assert.equal(xetraSpecial.state, "UNKNOWN");
assert.equal(xetraSpecial.nextAction, "RESEARCH_ONLY_SPECIAL_HOURS");
assert.equal(calendar("XMIL", "2026-12-30T10:00:00Z").state, "NO_LISTED_CLOSURE");
assert.equal(calendar("XPAR", "2026-12-30T10:00:00Z").state, "NO_LISTED_CLOSURE");
// Do not mistake every Italian or German public holiday for an exchange
// closure. These dates are full regular market days in the venue calendar.
for (const mic of ["XMIL", "XPAR", "XETR"]) {
  assert.equal(calendar(mic, "2026-05-25T11:00:00Z").state, "NO_LISTED_CLOSURE");
}
assert.equal(calendar("XMIL", "2026-12-08T11:00:00Z").state, "NO_LISTED_CLOSURE", "Italian Immaculate Conception is not a full cash-market closure");
assert.equal(calendar("XETR", "2026-10-03T11:00:00Z").state, "OFFICIAL_CLOSED");
for (const mic of ["XMIL", "XPAR", "XETR"]) {
  assert.equal(calendar(mic, "2026-10-10T11:00:00Z").state, "OFFICIAL_CLOSED", "Saturday");
  assert.equal(calendar(mic, "2026-10-11T11:00:00Z").state, "OFFICIAL_CLOSED", "Sunday");
  assert.equal(calendar(mic, "2027-04-02T11:00:00Z").state, "CALENDAR_NOT_VERIFIED", "never reuse 2026 after year boundary");
  assert.equal(venue(mic, "2027-04-02T11:00:00Z").state, "UNKNOWN");
}
assert.equal(calendar("XMIL", "2026-01-01T00:15:00Z").localDate, "2026-01-01");
assert.equal(calendar("XMIL", "2026-10-25T00:30:00Z").localDate, "2026-10-25", "DST switch is handled in venue local timezone");
assert.equal(calendar("XPAR", "2026-03-29T01:30:00Z").localDate, "2026-03-29");
assert.equal(calendar("XNYS", regular).state, "CALENDAR_NOT_VERIFIED", "Alpaca US PAPER clock is separate and authoritative");
assert.equal(calendar("NONEXIST", regular).state, "CALENDAR_NOT_VERIFIED");
assert.equal(getEuropeanOfficialCalendarStatus("XMIL", NaN).state, "CALENDAR_NOT_VERIFIED");
assert.equal(indicativeVenuePhase("XNYS", instant("2026-10-09T14:30:00Z")), "REGULAR_WINDOW", "US venue schedule remains unaffected");
console.log("Fenice 2026 official European closures/special-hours safety: PASS.");
