import assert from "node:assert/strict";
import { validateEuronextStreamBbo } from "../lib/trading/euronext-stream-validation.ts";

const now = Date.parse("2026-09-28T10:00:30.000Z");
const ns = (iso) => (BigInt(Date.parse(iso)) * 1_000_000n).toString();

const expected = {
  symbol: "ENI",
  isin: "IT0003132476",
  exchangeMic: "EXGM",
  currency: "EUR",
  market: "equity_italy",
  symbolIndex: 3316280,
};

const standingTopic = "view/StandingData/equity_italy/instrument/EXGM/3316280/StandingData";
const bboTopic = "view/BBO/equity_italy/EXGM/3316280";

const input = {
  standingTopic,
  standingData: {
    symbolIndex: 3316280,
    iSINCode: "IT0003132476",
    mIC: "EXGM",
    mICList: ["EXGM"],
    tradingCurrency: "EUR",
    priceDecimals: 7,
    instrumentTradingCode: "ENI",
  },
  bboTopic,
  bbo: {
    symbolIndex: 3316280,
    bestBid: {
      price: 147612300,
      rebroadcastIndicator: 0,
      eventTime: ns("2026-09-28T10:00:00.100Z"),
      mDContext: { packetTime: ns("2026-09-28T10:00:00.150Z") },
    },
    bestOffer: {
      price: 147645000,
      rebroadcastIndicator: 0,
      eventTime: ns("2026-09-28T10:00:00.120Z"),
      mDContext: { packetTime: ns("2026-09-28T10:00:00.170Z") },
    },
  },
};

const good = validateEuronextStreamBbo(input, expected, now);
assert.equal(good.accepted, true);
assert.equal(good.fresh, true);
assert.equal(good.evidence?.eligibility, "VALIDATION_ONLY");
assert.equal(good.evidence?.sourceFamily, "euronext-stream");
assert.equal(good.evidence?.exchangeMic, "EXGM");
assert.equal(good.evidence?.currency, "EUR");
assert.ok(Math.abs((good.evidence?.price ?? 0) - 14.762865) < 1e-9);
assert.match(good.evidence?.provenanceMethod || "", /mic:EXGM/);
assert.match(good.evidence?.provenanceMethod || "", /isin:IT0003132476/);
assert.match(good.evidence?.provenanceMethod || "", /timestamp-ns/);
assert.ok(good.reasons.some((r) => r.includes("validation evidence only")));

const wrongStandingTopic = validateEuronextStreamBbo({ ...input, standingTopic: standingTopic.replace("EXGM", "XPAR") }, expected, now);
assert.equal(wrongStandingTopic.accepted, false);
assert.equal(wrongStandingTopic.evidence, null);

const wrongBboTopic = validateEuronextStreamBbo({ ...input, bboTopic: bboTopic.replace("EXGM", "XPAR") }, expected, now);
assert.equal(wrongBboTopic.accepted, false);

const wrongMic = structuredClone(input);
wrongMic.standingData.mIC = "XMIL";
assert.equal(validateEuronextStreamBbo(wrongMic, expected, now).accepted, false);

const wrongIsin = structuredClone(input);
wrongIsin.standingData.iSINCode = "IT0000000000";
assert.equal(validateEuronextStreamBbo(wrongIsin, expected, now).accepted, false);

const wrongCurrency = structuredClone(input);
wrongCurrency.standingData.tradingCurrency = "USD";
assert.equal(validateEuronextStreamBbo(wrongCurrency, expected, now).accepted, false);

const wrongStandingIndex = structuredClone(input);
wrongStandingIndex.standingData.symbolIndex = 123;
assert.equal(validateEuronextStreamBbo(wrongStandingIndex, expected, now).accepted, false);

const wrongBboIndex = structuredClone(input);
wrongBboIndex.bbo.symbolIndex = 123;
assert.equal(validateEuronextStreamBbo(wrongBboIndex, expected, now).accepted, false);

const badDecimals = structuredClone(input);
badDecimals.standingData.priceDecimals = 99;
assert.equal(validateEuronextStreamBbo(badDecimals, expected, now).accepted, false);

const missingBid = structuredClone(input);
delete missingBid.bbo.bestBid;
assert.equal(validateEuronextStreamBbo(missingBid, expected, now).accepted, false);

const rebroadcast = structuredClone(input);
rebroadcast.bbo.bestBid.rebroadcastIndicator = 1;
const rebroadcastResult = validateEuronextStreamBbo(rebroadcast, expected, now);
assert.equal(rebroadcastResult.accepted, false);
assert.ok(rebroadcastResult.reasons.some((r) => r.includes("rebroadcast")));

const crossed = structuredClone(input);
crossed.bbo.bestBid.price = 148000000;
crossed.bbo.bestOffer.price = 147000000;
assert.equal(validateEuronextStreamBbo(crossed, expected, now).accepted, false);

const stale = structuredClone(input);
stale.bbo.bestBid.eventTime = ns("2026-09-28T09:55:00.000Z");
stale.bbo.bestBid.mDContext.packetTime = ns("2026-09-28T09:55:00.050Z");
const staleResult = validateEuronextStreamBbo(stale, expected, now);
assert.equal(staleResult.accepted, false);
assert.equal(staleResult.fresh, false);
assert.equal(staleResult.evidence, null);

const future = structuredClone(input);
future.bbo.bestOffer.eventTime = ns("2026-09-28T10:01:30.000Z");
future.bbo.bestOffer.mDContext.packetTime = ns("2026-09-28T10:01:30.050Z");
const futureResult = validateEuronextStreamBbo(future, expected, now);
assert.equal(futureResult.accepted, false);
assert.equal(futureResult.fresh, false);
assert.ok(futureResult.reasons.some((r) => r.includes("future")));

const milliseconds = structuredClone(input);
milliseconds.bbo.bestOffer.eventTime = String(Date.parse("2026-09-28T10:00:00.000Z"));
const badUnit = validateEuronextStreamBbo(milliseconds, expected, now);
assert.equal(badUnit.accepted, false);
assert.ok(badUnit.reasons.some((r) => r.includes("nanosecond")));

const packetBeforeEvent = structuredClone(input);
packetBeforeEvent.bbo.bestBid.eventTime = ns("2026-09-28T10:00:10.000Z");
packetBeforeEvent.bbo.bestBid.mDContext.packetTime = ns("2026-09-28T10:00:08.000Z");
const ordering = validateEuronextStreamBbo(packetBeforeEvent, expected, now);
assert.equal(ordering.accepted, false);
assert.ok(ordering.reasons.some((r) => r.includes("precedes eventTime")));

const invalidExpectedMic = validateEuronextStreamBbo(input, { ...expected, exchangeMic: "XMILA" }, now);
assert.equal(invalidExpectedMic.accepted, false);

const invalidExpectedIsin = validateEuronextStreamBbo(input, { ...expected, isin: "BAD" }, now);
assert.equal(invalidExpectedIsin.accepted, false);

console.log("Fenice Euronext Stream exact-MIC validation tests: PASS");
