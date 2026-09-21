import assert from "node:assert/strict";
import { buildDirectaExecutionEvidence } from "../lib/trading/directa-execution-evidence.ts";

const instruments = [
  { symbol: "MSFT", currency: "USD", assetClass: "equity", exchangeMic: "XNAS" },
  { symbol: "AAPL", currency: "USD", assetClass: "equity", exchangeMic: "XNAS" },
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
    {
      ticker: "MSFT",
      observedAt: "17:30:02",
      lastPrice: 500,
      lastQuantity: 10,
      dayLow: 495,
      dayHigh: 505,
      bidPrice: 499.9,
      bidQuantity: 100,
      askPrice: 500.1,
      askQuantity: 120,
      referencePrice: 498,
      openPrice: 499,
      isin: null,
      description: "Microsoft",
    },
    {
      ticker: "AAPL",
      observedAt: "17:25:00",
      lastPrice: 250,
      lastQuantity: 10,
      dayLow: 245,
      dayHigh: 252,
      bidPrice: null,
      bidQuantity: null,
      askPrice: null,
      askQuantity: null,
      referencePrice: 248,
      openPrice: 249,
      isin: null,
      description: "Apple",
    },
  ],
  errors: [],
  diagnostics: {
    heartbeatCount: 1,
    receivedMessages: 8,
    requestedTickers: ["MSFT", "AAPL"],
    pricedTickers: ["MSFT", "AAPL"],
    bidAskTickers: ["MSFT"],
  },
};

{
  const result = buildDirectaExecutionEvidence(
    snapshot,
    instruments,
    "2026-09-21T15:30:05.000Z",
    { realtimeEntitlementConfirmed: true },
  );
  assert.equal(result.accepted, true);
  assert.equal(result.paperEligibilityAllowed, true);
  assert.equal(result.observations.length, 2);
  const msft = result.observations.find((item) => item.symbol === "MSFT");
  const aapl = result.observations.find((item) => item.symbol === "AAPL");
  assert.equal(msft?.sourceFamily, "directa");
  assert.equal(msft?.eligibility, "PAPER");
  assert.equal(msft?.price, 500, "bid/ask midpoint should be preferred");
  assert.equal(aapl?.eligibility, "VALIDATION_ONLY", "old Directa quote must not satisfy PAPER quorum");
}

{
  const result = buildDirectaExecutionEvidence(snapshot, instruments, "2026-09-21T15:30:05.000Z");
  assert.equal(result.accepted, true, "safe Directa snapshot remains useful for validation");
  assert.equal(result.paperEligibilityAllowed, false);
  assert.ok(result.observations.every((item) => item.eligibility === "VALIDATION_ONLY"));
  assert.ok(result.warnings.some((warning) => warning.includes("not explicitly confirmed")));
}

{
  const noEntitlement = {
    ...snapshot,
    errors: [{ ticker: "MSFT", code: 1032 }],
  };
  const result = buildDirectaExecutionEvidence(
    noEntitlement,
    instruments,
    "2026-09-21T15:30:05.000Z",
    { realtimeEntitlementConfirmed: true },
  );
  assert.equal(result.accepted, true);
  assert.equal(result.paperEligibilityAllowed, false, "ERR 1032 must override manual realtime confirmation");
  assert.ok(result.observations.every((item) => item.eligibility === "VALIDATION_ONLY"));
}

{
  const unknownError = { ...snapshot, errors: [{ ticker: "MSFT", code: 9999 }] };
  const result = buildDirectaExecutionEvidence(
    unknownError,
    instruments,
    "2026-09-21T15:30:05.000Z",
    { realtimeEntitlementConfirmed: true },
  );
  assert.equal(result.accepted, false, "unclassified Directa datafeed errors must fail closed");
  assert.equal(result.observations.length, 0);
}

{
  const unsafe = { ...snapshot, writeTradingCommandsAllowed: true };
  const result = buildDirectaExecutionEvidence(
    unsafe,
    instruments,
    "2026-09-21T15:30:05.000Z",
    { realtimeEntitlementConfirmed: true },
  );
  assert.equal(result.accepted, false);
  assert.equal(result.observations.length, 0);
}

{
  const remote = { ...snapshot, host: "remote" };
  const result = buildDirectaExecutionEvidence(
    remote,
    instruments,
    "2026-09-21T15:30:05.000Z",
    { realtimeEntitlementConfirmed: true },
  );
  assert.equal(result.accepted, false);
}

{
  const stale = { ...snapshot, generatedAt: "2026-09-21T15:20:00.000Z" };
  const result = buildDirectaExecutionEvidence(
    stale,
    instruments,
    "2026-09-21T15:30:05.000Z",
    { realtimeEntitlementConfirmed: true },
  );
  assert.equal(result.accepted, false);
  assert.ok(result.reasons.some((reason) => reason.includes("stale")));
}

{
  const result = buildDirectaExecutionEvidence(null, instruments, "2026-09-21T15:30:05.000Z");
  assert.equal(result.accepted, false);
  assert.equal(result.snapshotAgeMs, null);
}

console.log("Directa execution-evidence invariants: PASS");
