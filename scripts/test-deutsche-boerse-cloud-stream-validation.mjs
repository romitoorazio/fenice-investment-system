import assert from "node:assert/strict";
import { validateDeutscheBoerseXetraEtpMessage } from "../lib/trading/deutsche-boerse-cloud-stream-validation.ts";

const now = Date.parse("2026-09-28T10:00:30.000Z");
const ns = (iso) => (BigInt(Date.parse(iso)) * 1_000_000n).toString();
const expected = {
  symbol: "EXSA",
  providerSymbol: "DE0005933931",
  isin: "DE0005933931",
  exchangeMic: "XETR",
  currency: "EUR",
};
const message = {
  subs: "md-xetraetfetp",
  seq: "123",
  messages: [{
    "@type": "type.googleapis.com/dbag.cef.MarketData",
    Instrmt: { MktID: "XETR", Sym: "DE0005933931", Src: { Value: "ISIN" }, SecTyp: { Value: "ETF" }, Ccy: "EUR" },
    Dat: {
      Bid: { Px: { m: "20123", e: -2 } },
      Offer: { Px: { m: "20127", e: -2 } },
      Status: { Value: "ACTIVE" },
      TrdgStat: { Value: "CONTINUOUS" },
      Tm: ns("2026-09-28T10:00:00.000Z"),
    },
  }],
};

const good = validateDeutscheBoerseXetraEtpMessage(message, expected, now);
assert.equal(good.accepted, true);
assert.equal(good.fresh, true);
assert.equal(good.evidence?.eligibility, "VALIDATION_ONLY");
assert.equal(good.evidence?.exchangeMic, "XETR");
assert.equal(good.evidence?.sourceFamily, "deutsche-boerse-cloud-stream");
assert.equal(good.evidence?.price, 201.25);
assert.match(good.evidence?.provenanceMethod || "", /timestamp-ns/);

const wrongSubject = validateDeutscheBoerseXetraEtpMessage({ ...message, subs: "md-tradegate" }, expected, now);
assert.equal(wrongSubject.accepted, false);
assert.equal(wrongSubject.evidence, null);

const wrongMic = structuredClone(message);
wrongMic.messages[0].Instrmt.MktID = "XGAT";
assert.equal(validateDeutscheBoerseXetraEtpMessage(wrongMic, expected, now).accepted, false);

const wrongIdentity = structuredClone(message);
wrongIdentity.messages[0].Instrmt.Sym = "DE0000000001";
assert.equal(validateDeutscheBoerseXetraEtpMessage(wrongIdentity, expected, now).accepted, false);

const wrongCurrency = structuredClone(message);
wrongCurrency.messages[0].Instrmt.Ccy = "USD";
assert.equal(validateDeutscheBoerseXetraEtpMessage(wrongCurrency, expected, now).accepted, false);

const crossed = structuredClone(message);
crossed.messages[0].Dat.Bid.Px = { m: "20200", e: -2 };
crossed.messages[0].Dat.Offer.Px = { m: "20100", e: -2 };
assert.equal(validateDeutscheBoerseXetraEtpMessage(crossed, expected, now).accepted, false);

const stale = structuredClone(message);
stale.messages[0].Dat.Tm = ns("2026-09-28T09:55:00.000Z");
const staleResult = validateDeutscheBoerseXetraEtpMessage(stale, expected, now);
assert.equal(staleResult.accepted, false);
assert.equal(staleResult.fresh, false);
assert.equal(staleResult.evidence, null);

const future = structuredClone(message);
future.messages[0].Dat.Tm = ns("2026-09-28T10:01:30.000Z");
const futureResult = validateDeutscheBoerseXetraEtpMessage(future, expected, now);
assert.equal(futureResult.accepted, false);
assert.equal(futureResult.fresh, false);
assert.ok(futureResult.reasons.some((r) => r.includes("future")));

const millisecondsInsteadOfNs = structuredClone(message);
millisecondsInsteadOfNs.messages[0].Dat.Tm = String(Date.parse("2026-09-28T10:00:00.000Z"));
const badUnit = validateDeutscheBoerseXetraEtpMessage(millisecondsInsteadOfNs, expected, now);
assert.equal(badUnit.accepted, false);
assert.ok(badUnit.reasons.some((r) => r.includes("nanosecond")));

const inactive = structuredClone(message);
inactive.messages[0].Dat.Status.Value = "INACTIVE";
assert.equal(validateDeutscheBoerseXetraEtpMessage(inactive, expected, now).accepted, false);

const auction = structuredClone(message);
auction.messages[0].Dat.TrdgStat.Value = "AUCTION";
assert.equal(validateDeutscheBoerseXetraEtpMessage(auction, expected, now).accepted, false);

const multiple = structuredClone(message);
multiple.messages.push(structuredClone(multiple.messages[0]));
assert.equal(validateDeutscheBoerseXetraEtpMessage(multiple, expected, now).accepted, false);

console.log("Fenice Deutsche Boerse Cloud Stream validation tests: PASS");
