import assert from "node:assert/strict";
import { normalizeDatafeedTickers, parseDirectaDatafeedLine } from "../lib/brokers/directa-datafeed.ts";

assert.deepEqual(normalizeDatafeedTickers(["stlam", "STLAM", "UCG"]), ["STLAM", "UCG"]);
assert.throws(() => normalizeDatafeedTickers([]), /EMPTY_SUBSCRIPTION/);
assert.throws(() => normalizeDatafeedTickers(["BAD TICKER"]), /INVALID_TICKER/);
assert.throws(() => normalizeDatafeedTickers(Array.from({ length: 91 }, (_, index) => `T${index}`)), /MAX_90/);

assert.deepEqual(parseDirectaDatafeedLine("H\n"), { kind: "heartbeat" });

const anag = parseDirectaDatafeedLine("ANAG;STLAM;16:18:13;NL0010877643;STLAM;6.875;0.0;1202181255\n");
assert.equal(anag.kind, "anag");
assert.equal(anag.ticker, "STLAM");
assert.equal(anag.isin, "NL0010877643");
assert.equal(anag.referencePrice, 6.875);
assert.equal(anag.openPrice, 0);

const price = parseDirectaDatafeedLine("PRICE;STLAM;16:18:11;6.73;10;17917975;10150;6.57;6.93\n");
assert.equal(price.kind, "price");
assert.equal(price.price, 6.73);
assert.equal(price.quantity, 10);
assert.equal(price.dayLow, 6.57);
assert.equal(price.dayHigh, 6.93);

const priceAuction = parseDirectaDatafeedLine("PRICE_AUCT;STLAM;16:28:56;7.8\n");
assert.equal(priceAuction.kind, "price");
assert.equal(priceAuction.price, 7.8);
assert.equal(priceAuction.quantity, null);
assert.equal(priceAuction.dayLow, null);
assert.equal(priceAuction.dayHigh, null);

const missingNumeric = parseDirectaDatafeedLine("PRICE;STLAM;16:18:11;6.73;;;;;\n");
assert.equal(missingNumeric.kind, "price");
assert.equal(missingNumeric.quantity, null);
assert.equal(missingNumeric.dayLow, null);
assert.equal(missingNumeric.dayHigh, null);

const bidask = parseDirectaDatafeedLine("BIDASK;STLAM;16:18:12;100;2;6.72;120;3;6.74\n");
assert.equal(bidask.kind, "bidask");
assert.equal(bidask.bidQuantity, 100);
assert.equal(bidask.bidPrice, 6.72);
assert.equal(bidask.askQuantity, 120);
assert.equal(bidask.askPrice, 6.74);

const error = parseDirectaDatafeedLine("ERR;FFFF;1007\n");
assert.equal(error.kind, "error");
assert.equal(error.ticker, "FFFF");
assert.equal(error.code, 1007);

console.log("Fenice Directa datafeed protocol tests: PASS");
