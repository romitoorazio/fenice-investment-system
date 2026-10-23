import assert from "node:assert/strict";
import { validateEodhdEuRealtimeMessage } from "../lib/trading/eodhd-eu-realtime-validation.ts";

const now = Date.parse("2026-09-28T10:00:30.000Z");
const expected = {
  symbol: "SAP",
  providerSymbol: "SAP.XETRA",
  primaryMic: "XETR",
  currency: "EUR",
};

const trade = validateEodhdEuRealtimeMessage({
  s: "SAP.XETRA",
  p: 241.3,
  t: Date.parse("2026-09-28T10:00:00.000Z"),
  ms: "open",
}, expected, now);
assert.equal(trade.accepted, true);
assert.equal(trade.fresh, true);
assert.equal(trade.evidence?.eligibility, "VALIDATION_ONLY");
assert.equal(trade.evidence?.sourceFamily, "eodhd-cboe-europe");
assert.equal(trade.evidence?.exchangeMic, "XETR");
assert.equal(trade.evidence?.provenanceVerified, true);
assert.match(trade.evidence?.provenanceMethod || "", /primary-mic-not-source:XETR/);
assert.ok(trade.reasons.some((r) => r.includes("cannot satisfy exact-primary-MIC PAPER quorum")));

const quote = validateEodhdEuRealtimeMessage({
  s: "SAP.XETRA",
  bp: 241.2,
  ap: 241.4,
  t: Date.parse("2026-09-28T10:00:02.000Z"),
}, expected, now);
assert.equal(quote.accepted, true);
assert.equal(quote.evidence?.price, 241.3);
assert.equal(quote.evidence?.eligibility, "VALIDATION_ONLY");

const wrongSymbol = validateEodhdEuRealtimeMessage({
  s: "ASML.AS",
  p: 700,
  t: Date.parse("2026-09-28T10:00:00.000Z"),
}, expected, now);
assert.equal(wrongSymbol.accepted, false);
assert.equal(wrongSymbol.evidence, null);

const stale = validateEodhdEuRealtimeMessage({
  s: "SAP.XETRA",
  p: 241.3,
  t: Date.parse("2026-09-28T09:55:00.000Z"),
}, expected, now);
assert.equal(stale.accepted, true);
assert.equal(stale.fresh, false);
assert.equal(stale.evidence?.eligibility, "VALIDATION_ONLY");

const epochSeconds = validateEodhdEuRealtimeMessage({
  s: "SAP.XETRA",
  p: 241.3,
  t: Math.floor(Date.parse("2026-09-28T10:00:00.000Z") / 1000),
}, expected, now);
assert.equal(epochSeconds.accepted, false);
assert.equal(epochSeconds.evidence, null);
assert.ok(epochSeconds.reasons.some((r) => r.includes("epoch-ms")));

const future = validateEodhdEuRealtimeMessage({
  s: "SAP.XETRA",
  p: 241.3,
  t: Date.parse("2026-09-28T10:01:30.000Z"),
}, expected, now);
assert.equal(future.accepted, false);
assert.equal(future.fresh, false);
assert.equal(future.evidence, null);
assert.ok(future.reasons.some((r) => r.includes("future")));

const smallClockSkew = validateEodhdEuRealtimeMessage({
  s: "SAP.XETRA",
  p: 241.3,
  t: Date.parse("2026-09-28T10:00:33.000Z"),
}, expected, now);
assert.equal(smallClockSkew.accepted, true);
assert.equal(smallClockSkew.fresh, true);

const closedMarket = validateEodhdEuRealtimeMessage({
  s: "SAP.XETRA",
  p: 241.3,
  t: Date.parse("2026-09-28T10:00:00.000Z"),
  ms: "closed",
}, expected, now);
assert.equal(closedMarket.accepted, true);
assert.equal(closedMarket.evidence?.eligibility, "VALIDATION_ONLY");
assert.ok(closedMarket.reasons.some((r) => r.includes("market status is closed")));

const badMic = validateEodhdEuRealtimeMessage({
  s: "SAP.XETRA",
  p: 241.3,
  t: Date.parse("2026-09-28T10:00:00.000Z"),
}, { ...expected, primaryMic: "XETRA" }, now);
assert.equal(badMic.accepted, false);
assert.equal(badMic.evidence, null);

const noPrice = validateEodhdEuRealtimeMessage({
  s: "SAP.XETRA",
  t: Date.parse("2026-09-28T10:00:00.000Z"),
}, expected, now);
assert.equal(noPrice.accepted, false);

console.log("Fenice EODHD EU realtime validation tests: PASS");
