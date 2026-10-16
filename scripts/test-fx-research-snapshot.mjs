import assert from "node:assert/strict";
import { extractYahooEurUsdResearchSnapshot as readFx } from "../lib/ui/fx-research-snapshot.ts";

const utc = text => Math.floor(Date.parse(text) / 1000);
const now = Date.parse("2026-10-16T18:00:00.000Z");
const snapshot = (ts, closes) => ({
  chart: { result: [{ timestamp: ts, indicators: { quote: [{ close: closes }] } }] },
});
const fri = utc("2026-10-16T16:00:00.000Z");
const thurs = utc("2026-10-15T16:00:00.000Z");

const paired = readFx(snapshot([thurs, fri], [1.165, null]), now);
assert.equal(paired.eurUsd, 1.165);
assert.equal(paired.observedAt, "2026-10-15T16:00:00.000Z",
  "the last valid close must use its OWN timestamp, never timestamp.at(-1)");
assert.equal(paired.status, "parziale", "an old daily close must never be labelled intraday current");
assert.equal(paired.staleForIntraday, true);
assert.equal(paired.paperFxEligible, false);
assert.equal(paired.liveTradingAllowed, false);

const fresh = readFx(snapshot([thurs, fri], [1.165, 1.17]), now);
assert.equal(fresh.eurUsd, 1.17);
assert.equal(fresh.observedAt, "2026-10-16T16:00:00.000Z");
assert.equal(fresh.status, "operativo");
assert.equal(fresh.quoteKind, "HISTORICAL_DAILY_CLOSE");

const outOfOrder = readFx(snapshot([fri, thurs], [1.18, 1.1]), now);
assert.equal(outOfOrder.eurUsd, 1.18, "select newest paired timestamp even if provider rows are out of order");

assert.throws(() => readFx(snapshot([], []), now), /FX_PAIR_WITH_VALID_TIMESTAMP_MISSING/);
assert.throws(() => readFx(snapshot([fri], [null]), now), /FX_PAIR_WITH_VALID_TIMESTAMP_MISSING/);
assert.throws(() => readFx(snapshot([fri], [0]), now), /FX_PAIR_WITH_VALID_TIMESTAMP_MISSING/);
assert.throws(() => readFx(snapshot([fri], ["1.15"]), now), /FX_PAIR_WITH_VALID_TIMESTAMP_MISSING/);
assert.throws(() => readFx(snapshot([fri, thurs], [1.1]), now), /FX_QUOTE_TIMESTAMP_MISMATCH/);
assert.throws(() => readFx({ chart: { result: [{}] } }, now), /FX_TIMESTAMP_MISSING/);
assert.throws(() => readFx(snapshot([utc("2026-10-17T09:00:00Z")], [1.2]), now),
  /FX_PAIR_WITH_VALID_TIMESTAMP_MISSING/, "future-dated close must not be accepted");
assert.throws(() => readFx(snapshot([utc("2026-10-01T09:00:00Z")], [1.2]), now),
  /FX_RESEARCH_PRICE_EXPIRED/, "stale older-than-7d quote must not appear current");
assert.throws(() => readFx(snapshot([fri], [1.2]), Number.NaN), /INVALID_FX_CLOCK/);

console.log("Fenice Yahoo FX aligned close/timestamp, research-only and stale-safety invariants: PASS");
