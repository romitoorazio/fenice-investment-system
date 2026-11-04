import assert from "node:assert/strict";
import { validateDeutscheBoerseTradegateMessage } from "../lib/trading/deutsche-boerse-tradegate-validation.ts";

const now = Date.parse("2026-09-28T10:00:30.000Z");
const ns = (iso) => `${Date.parse(iso)}000000`;
const expected = {
  symbol: "SAP",
  providerSymbol: "SAP",
  exchangeMic: "XGAT",
  currency: "EUR",
};
const message = {
  subs: "md-tradegate",
  seq: "123",
  messages: [{
    "@type": "type.googleapis.com/dbag.cef.MarketData",
    Instrmt: { MktID: "XGAT", Sym: "SAP", SecTyp: "CS" },
    Dat: {
      Quote: {
        Bid: { Px: { m: "24120", e: -2 }, MDQteTyp: { Value: "TRADEABLE" } },
        Offer: { Px: { m: "24140", e: -2 }, MDQteTyp: { Value: "TRADEABLE" } },
      },
      Status: { Value: "ACTIVE" },
      TrdgStat: { Value: "CONTINUOUS" },
      Ccy: "EUR",
      Tm: ns("2026-09-28T10:00:00.000Z"),
    },
  }],
};

const good = validateDeutscheBoerseTradegateMessage(message, expected, now);
assert.equal(good.accepted, true);
assert.equal(good.fresh, true);
assert.equal(good.evidence?.eligibility, "VALIDATION_ONLY");
assert.equal(good.evidence?.exchangeMic, "XGAT");
assert.equal(good.evidence?.sourceFamily, "deutsche-boerse-tradegate");
assert.equal(good.evidence?.assetClass, "equity");
assert.equal(good.evidence?.price, 241.3);
assert.match(good.evidence?.provenanceMethod || "", /tradeable-bbo/);
assert.match(good.evidence?.provenanceMethod || "", /timestamp-ns/);

const wrongSubject = validateDeutscheBoerseTradegateMessage({ ...message, subs: "md-xetraetfetp" }, expected, now);
assert.equal(wrongSubject.accepted, false);

const wrongMic = structuredClone(message);
wrongMic.messages[0].Instrmt.MktID = "XETR";
assert.equal(validateDeutscheBoerseTradegateMessage(wrongMic, expected, now).accepted, false);

const wrongSymbol = structuredClone(message);
wrongSymbol.messages[0].Instrmt.Sym = "SIE";
assert.equal(validateDeutscheBoerseTradegateMessage(wrongSymbol, expected, now).accepted, false);

const notCommonStock = structuredClone(message);
notCommonStock.messages[0].Instrmt.SecTyp = "ETF";
assert.equal(validateDeutscheBoerseTradegateMessage(notCommonStock, expected, now).accepted, false);

const wrongCurrency = structuredClone(message);
wrongCurrency.messages[0].Dat.Ccy = "USD";
assert.equal(validateDeutscheBoerseTradegateMessage(wrongCurrency, expected, now).accepted, false);

const indicativeBid = structuredClone(message);
indicativeBid.messages[0].Dat.Quote.Bid.MDQteTyp.Value = "INDICATIVE";
const indicativeBidResult = validateDeutscheBoerseTradegateMessage(indicativeBid, expected, now);
assert.equal(indicativeBidResult.accepted, false);
assert.ok(indicativeBidResult.reasons.some((r) => r.includes("bid is not explicitly TRADEABLE")));

const missingQuoteType = structuredClone(message);
delete missingQuoteType.messages[0].Dat.Quote.Offer.MDQteTyp;
assert.equal(validateDeutscheBoerseTradegateMessage(missingQuoteType, expected, now).accepted, false);

const crossed = structuredClone(message);
crossed.messages[0].Dat.Quote.Bid.Px = { m: "24200", e: -2 };
crossed.messages[0].Dat.Quote.Offer.Px = { m: "24100", e: -2 };
assert.equal(validateDeutscheBoerseTradegateMessage(crossed, expected, now).accepted, false);

const inactive = structuredClone(message);
inactive.messages[0].Dat.Status.Value = "SUSPENDED";
assert.equal(validateDeutscheBoerseTradegateMessage(inactive, expected, now).accepted, false);

const auction = structuredClone(message);
auction.messages[0].Dat.TrdgStat.Value = "OPENINGAUCTION";
assert.equal(validateDeutscheBoerseTradegateMessage(auction, expected, now).accepted, false);

const stale = structuredClone(message);
stale.messages[0].Dat.Tm = ns("2026-09-28T09:55:00.000Z");
const staleResult = validateDeutscheBoerseTradegateMessage(stale, expected, now);
assert.equal(staleResult.accepted, false);
assert.equal(staleResult.fresh, false);

const future = structuredClone(message);
future.messages[0].Dat.Tm = ns("2026-09-28T10:01:30.000Z");
const futureResult = validateDeutscheBoerseTradegateMessage(future, expected, now);
assert.equal(futureResult.accepted, false);
assert.equal(futureResult.fresh, false);
assert.ok(futureResult.reasons.some((r) => r.includes("future")));

const millisecondsInsteadOfNs = structuredClone(message);
millisecondsInsteadOfNs.messages[0].Dat.Tm = String(Date.parse("2026-09-28T10:00:00.000Z"));
const badUnit = validateDeutscheBoerseTradegateMessage(millisecondsInsteadOfNs, expected, now);
assert.equal(badUnit.accepted, false);
assert.ok(badUnit.reasons.some((r) => r.includes("nanosecond")));

const multiple = structuredClone(message);
multiple.messages.push(structuredClone(multiple.messages[0]));
assert.equal(validateDeutscheBoerseTradegateMessage(multiple, expected, now).accepted, false);

console.log("Fenice Deutsche Boerse Tradegate BSX validation tests: PASS");
