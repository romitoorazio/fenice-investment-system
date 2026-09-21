import assert from "node:assert/strict";
import { buildDirectaExecutionEvidence } from "../lib/trading/directa-execution-evidence.ts";

const instruments = [
  { symbol: "MSFT", currency: "USD", assetClass: "equity", exchangeMic: "XNAS", isin: "US5949181045" },
  { symbol: "AAPL", currency: "USD", assetClass: "equity", exchangeMic: "XNAS", isin: "US0378331005" },
  { symbol: "SAP", currency: "EUR", assetClass: "equity", exchangeMic: "XETR", isin: "DE0007164600" },
];
const snapshot = {
  generatedAt: "2026-09-21T15:30:03.000Z",
  source: "directa-dapi-datafeed-local",
  mode: "read-only-market-data",
  host: "loopback",
  datafeedPort: 10001,
  subscriptionCommand: "SUBPRZALL",
  writeTradingCommandsAllowed: false,
  quotes: [
    { ticker: "MSFT", observedAt: "17:30:02", lastPrice: 500, lastQuantity: 10, dayLow: 495, dayHigh: 505, bidPrice: 499.9, bidQuantity: 100, askPrice: 500.1, askQuantity: 120, referencePrice: 498, openPrice: 499, isin: "US5949181045", description: "Microsoft" },
    { ticker: "AAPL", observedAt: "17:25:00", lastPrice: 250, lastQuantity: 10, dayLow: 245, dayHigh: 252, bidPrice: null, bidQuantity: null, askPrice: null, askQuantity: null, referencePrice: 248, openPrice: 249, isin: "US0378331005", description: "Apple" },
    { ticker: "SAP", observedAt: "17:30:01", lastPrice: 230, lastQuantity: 5, dayLow: 225, dayHigh: 232, bidPrice: 229.9, bidQuantity: 50, askPrice: 230.1, askQuantity: 60, referencePrice: 228, openPrice: 229, isin: "DE0007164600", description: "SAP" },
  ],
  errors: [],
  diagnostics: { heartbeatCount: 1, receivedMessages: 12, requestedTickers: ["MSFT", "AAPL", "SAP"], pricedTickers: ["MSFT", "AAPL", "SAP"], bidAskTickers: ["MSFT", "SAP"] },
};

{
  const result = buildDirectaExecutionEvidence(snapshot, instruments, "2026-09-21T15:30:05.000Z", {
    realtimeEntitlementConfirmed: true,
    confirmedRealtimeMarketMics: ["XNAS"],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.paperEligibilityAllowed, true);
  assert.deepEqual(result.confirmedRealtimeMarketMics, ["XNAS"]);
  assert.equal(result.identityVerifiedQuotes, 3);
  assert.equal(result.identityRejectedQuotes, 0);
  assert.equal(result.executableBookVerifiedQuotes, 2);
  assert.equal(result.executableBookRejectedQuotes, 1);
  const msft = result.observations.find((item) => item.symbol === "MSFT");
  const aapl = result.observations.find((item) => item.symbol === "AAPL");
  const sap = result.observations.find((item) => item.symbol === "SAP");
  assert.equal(msft?.eligibility, "PAPER");
  assert.equal(msft?.price, 500);
  assert.equal(aapl?.eligibility, "VALIDATION_ONLY", "old Directa quote without executable book must not satisfy PAPER quorum");
  assert.equal(sap?.eligibility, "VALIDATION_ONLY", "fresh quote on an unconfirmed market must not satisfy PAPER quorum");
}

{
  const lastOnlyFresh = {
    ...snapshot,
    quotes: snapshot.quotes.map((quote) => quote.ticker === "MSFT" ? {
      ...quote,
      bidPrice: null,
      bidQuantity: null,
      askPrice: null,
      askQuantity: null,
    } : quote),
  };
  const result = buildDirectaExecutionEvidence(lastOnlyFresh, instruments, "2026-09-21T15:30:05.000Z", {
    realtimeEntitlementConfirmed: true,
    confirmedRealtimeMarketMics: ["XNAS"],
  });
  assert.equal(result.observations.find((item) => item.symbol === "MSFT")?.eligibility, "VALIDATION_ONLY");
  assert.ok(result.warnings.some((warning) => warning.includes("top-of-book")));
}

{
  const zeroDepth = {
    ...snapshot,
    quotes: snapshot.quotes.map((quote) => quote.ticker === "MSFT" ? { ...quote, bidQuantity: 0 } : quote),
  };
  const result = buildDirectaExecutionEvidence(zeroDepth, instruments, "2026-09-21T15:30:05.000Z", {
    realtimeEntitlementConfirmed: true,
    confirmedRealtimeMarketMics: ["XNAS"],
  });
  assert.equal(result.observations.find((item) => item.symbol === "MSFT")?.eligibility, "VALIDATION_ONLY");
}

{
  const mismatch = {
    ...snapshot,
    quotes: snapshot.quotes.map((quote) => quote.ticker === "MSFT" ? { ...quote, isin: "US0378331005" } : quote),
  };
  const result = buildDirectaExecutionEvidence(mismatch, instruments, "2026-09-21T15:30:05.000Z", {
    realtimeEntitlementConfirmed: true,
    confirmedRealtimeMarketMics: ["XNAS"],
  });
  assert.equal(result.observations.find((item) => item.symbol === "MSFT")?.eligibility, "VALIDATION_ONLY");
  assert.equal(result.identityRejectedQuotes, 1);
  assert.ok(result.warnings.some((warning) => warning.includes("identity mismatch")));
}

{
  const missingMasterIdentity = instruments.map((instrument) => instrument.symbol === "MSFT" ? { ...instrument, isin: undefined } : instrument);
  const result = buildDirectaExecutionEvidence(snapshot, missingMasterIdentity, "2026-09-21T15:30:05.000Z", {
    realtimeEntitlementConfirmed: true,
    confirmedRealtimeMarketMics: ["XNAS"],
  });
  assert.equal(result.observations.find((item) => item.symbol === "MSFT")?.eligibility, "VALIDATION_ONLY");
  assert.ok(result.warnings.some((warning) => warning.includes("instrument-master ISIN missing")));
}

{
  const result = buildDirectaExecutionEvidence(snapshot, instruments, "2026-09-21T15:30:05.000Z", {
    realtimeEntitlementConfirmed: true,
    confirmedRealtimeMarketMics: [],
  });
  assert.equal(result.paperEligibilityAllowed, false);
  assert.ok(result.observations.every((item) => item.eligibility === "VALIDATION_ONLY"));
}

{
  const noEntitlement = { ...snapshot, errors: [{ ticker: "MSFT", code: 1032 }] };
  const result = buildDirectaExecutionEvidence(noEntitlement, instruments, "2026-09-21T15:30:05.000Z", {
    realtimeEntitlementConfirmed: true,
    confirmedRealtimeMarketMics: ["XNAS"],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.paperEligibilityAllowed, false);
  assert.ok(result.observations.every((item) => item.eligibility === "VALIDATION_ONLY"));
}

{
  const unknownError = { ...snapshot, errors: [{ ticker: "MSFT", code: 9999 }] };
  const result = buildDirectaExecutionEvidence(unknownError, instruments, "2026-09-21T15:30:05.000Z", {
    realtimeEntitlementConfirmed: true,
    confirmedRealtimeMarketMics: ["XNAS"],
  });
  assert.equal(result.accepted, false);
  assert.equal(result.observations.length, 0);
}

{
  const unsafe = { ...snapshot, writeTradingCommandsAllowed: true };
  const result = buildDirectaExecutionEvidence(unsafe, instruments, "2026-09-21T15:30:05.000Z", {
    realtimeEntitlementConfirmed: true,
    confirmedRealtimeMarketMics: ["XNAS"],
  });
  assert.equal(result.accepted, false);
}

{
  const stale = { ...snapshot, generatedAt: "2026-09-21T15:20:00.000Z" };
  const result = buildDirectaExecutionEvidence(stale, instruments, "2026-09-21T15:30:05.000Z", {
    realtimeEntitlementConfirmed: true,
    confirmedRealtimeMarketMics: ["XNAS"],
  });
  assert.equal(result.accepted, false);
  assert.ok(result.reasons.some((reason) => reason.includes("stale")));
}

console.log("Directa execution-evidence invariants: PASS");
