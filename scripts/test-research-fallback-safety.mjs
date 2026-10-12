import assert from "node:assert/strict";
import {
  validateStooqResearchQuote,
  isStooqProviderAccessFailure,
  preferMarketObservation,
} from "../lib/intelligence/research-fallback-safety.mjs";

const now = Date.parse("2026-10-12T16:10:00.000Z");
const row = { Date: "2026-10-12", Time: "16:00:00", Open: "120", Close: "125" };
assert.deepEqual(validateStooqResearchQuote(row, now), {
  price: 125, open: 120, observedAt: "2026-10-12T14:00:00.000Z",
});
assert.equal(validateStooqResearchQuote({ ...row, Date: "2026-02-30" }, now), null, "reject impossible calendar dates");
assert.equal(validateStooqResearchQuote({ ...row, Date: "2026-10-13" }, now), null, "reject future observations");
assert.equal(validateStooqResearchQuote({ ...row, Date: "2026-10-01" }, now), null, "reject stale CSV data");
assert.equal(validateStooqResearchQuote({ ...row, Time: "25:00:00" }, now), null, "reject impossible clock times");
assert.equal(validateStooqResearchQuote({ ...row, Time: "" }, now), null, "reject missing time");
assert.equal(validateStooqResearchQuote({ ...row, Close: "N/D" }, now), null, "reject missing price");
assert.equal(validateStooqResearchQuote({ ...row, Open: "0" }, now), null, "reject unusable open");
assert.equal(validateStooqResearchQuote(row, Number.NaN), null);
assert.equal(validateStooqResearchQuote(row, now, 1000), null);

assert(isStooqProviderAccessFailure(new Error("HTTP 429: too many requests")));
assert(isStooqProviderAccessFailure(new Error("HTTP 403")));
assert(isStooqProviderAccessFailure("HTTP 503"));
assert(!isStooqProviderAccessFailure(new Error("HTTP 404")));
assert(!isStooqProviderAccessFailure(new Error("timeout")));

const primary = { source: "Official research data", score: 45, observedAt: "2026-10-12T15:00:00Z" };
const fallback = { source: "Stooq public fallback", score: 99, observedAt: "2026-10-12T16:00:00Z" };
assert(!preferMarketObservation(primary, fallback), "fallback may never override known primary on score");
assert(preferMarketObservation(fallback, primary), "known primary replaces fallback even at lower research score");
assert(preferMarketObservation(primary, { ...primary, observedAt: "2026-10-12T16:00:00Z", score: 40 }), "newer same-source observation wins");
assert(!preferMarketObservation(primary, { ...primary, observedAt: "2026-10-12T14:00:00Z", score: 90 }), "older same-source observation does not win on score");
assert(!preferMarketObservation(primary, { score: 100, observedAt: "2026-10-12T16:00:00Z" }), "unknown provenance does not override a known source");
assert(preferMarketObservation(null, fallback));

console.log("Fenice research fallback freshness, throttling and provenance invariants: PASS");
