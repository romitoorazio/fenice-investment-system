import assert from "node:assert/strict";
import { evaluateDirectaShadowCycle } from "../lib/trading/directa-shadow-cycle.ts";

const now = "2026-09-21T22:00:00.000Z";
const order = {
  clientOrderId: "shadow-cycle-1",
  symbol: "TEST",
  side: "BUY",
  orderType: "LIMIT",
  timeInForce: "DAY",
  quantity: 10,
  referencePrice: 100,
  limitPrice: 100,
  currency: "EUR",
  mode: "PAPER",
  requestedAt: "2026-09-21T21:59:55.000Z",
  humanConfirmed: true,
};
const risk = {
  allowed: true,
  orderNotionalEuro: 1000,
  resultingPositionWeightPercent: 10,
  resultingGrossExposurePercent: 10,
  resultingDailyTurnoverPercent: 10,
  checks: [],
  reasons: [],
};
const executionSafety = {
  allowed: true,
  reasons: [],
  metrics: { priceDeviationPercent: 0, cashAfterOrderEuro: 9000, requiredReserveEuro: 200 },
};
const expectation = {
  positions: [{ symbol: "TEST", quantity: 5 }],
  openOrderClientIds: [],
  expectedCashEuro: 10_000,
};
const snapshot = {
  generatedAt: "2026-09-21T21:59:58.000Z",
  source: "directa-dapi-local",
  mode: "read-only",
  host: "loopback",
  tradingPort: 10001,
  liveTradingAllowed: false,
  writeCommandsBlocked: true,
  connection: {
    state: "CONNECTED",
    datafeedEnabled: true,
    release: "test",
    healthy: true,
  },
  account: {
    identifierPersisted: false,
    identifierPresent: true,
    liquidity: 10_000,
    gainEuro: 0,
    openProfitLoss: 0,
    equity: 10_500,
  },
  availability: {
    equities: 10_000,
    equitiesMargin: 0,
    derivatives: 0,
    derivativesMargin: 0,
    totalLiquidity: 10_000,
  },
  positions: [{
    ticker: "TEST",
    portfolioQuantity: 5,
    directaQuantity: 5,
    negotiationQuantityRaw: "0",
    averagePrice: 95,
    theoreticalGain: 25,
    observedAt: "2026-09-21T21:59:58.000Z",
  }],
  orders: [],
  errors: [],
  diagnostics: {
    heartbeatCount: 2,
    unknownMessageTypes: [],
    receivedMessages: 12,
    stockListComplete: true,
    orderListComplete: true,
  },
};
const marketObservation = {
  symbol: "TEST",
  price: 100.01,
  observedAt: "2026-09-21T21:59:59.000Z",
  source: "directa-dapi-local",
};

{
  const result = evaluateDirectaShadowCycle(order, risk, executionSafety, expectation, snapshot, marketObservation, undefined, now);
  assert.equal(result.status, "SHADOW_READY");
  assert.equal(result.reconciliation.balanced, true);
  assert.equal(result.shadow.status, "SHADOW_ACCEPTED");
  assert.equal(result.transmitted, false);
  assert.equal(result.liveTradingAllowed, false);
  assert.equal(result.safetyBoundaryValid, true);
}

{
  const stale = { ...snapshot, generatedAt: "2026-09-21T21:59:00.000Z" };
  const result = evaluateDirectaShadowCycle(order, risk, executionSafety, expectation, stale, marketObservation, undefined, now);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.brokerSnapshotFresh, false);
}

{
  const mismatched = {
    ...snapshot,
    positions: snapshot.positions.map((position) => ({ ...position, portfolioQuantity: 4, directaQuantity: 4 })),
  };
  const result = evaluateDirectaShadowCycle(order, risk, executionSafety, expectation, mismatched, marketObservation, undefined, now);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reconciliation.balanced, false);
}

{
  const unsafe = { ...snapshot, liveTradingAllowed: true, writeCommandsBlocked: false };
  const result = evaluateDirectaShadowCycle(order, risk, executionSafety, expectation, unsafe, marketObservation, undefined, now);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.safetyBoundaryValid, false);
  assert.equal(result.transmitted, false);
}

{
  const unconfirmed = { ...order, humanConfirmed: false };
  const result = evaluateDirectaShadowCycle(unconfirmed, risk, executionSafety, expectation, snapshot, marketObservation, undefined, now);
  assert.equal(result.status, "BLOCKED");
}

{
  const badObservation = { ...marketObservation, symbol: "OTHER" };
  const result = evaluateDirectaShadowCycle(order, risk, executionSafety, expectation, snapshot, badObservation, undefined, now);
  assert.equal(result.status, "BLOCKED");
}

{
  const riskRejected = { ...risk, allowed: false, reasons: ["portfolio risk gate"] };
  const result = evaluateDirectaShadowCycle(order, riskRejected, executionSafety, expectation, snapshot, marketObservation, undefined, now);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasons.some((reason) => reason.includes("pretrade")));
}

console.log("Directa shadow-cycle invariants: PASS");
