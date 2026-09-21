import assert from "node:assert/strict";
import { evaluateEventRisk } from "../lib/trading/event-risk-gate.ts";
import { evaluateMarketDataQuorum } from "../lib/trading/market-data-quorum.ts";
import { evaluatePortfolioRisk } from "../lib/trading/portfolio-risk.ts";
import { evaluateRecovery } from "../lib/trading/recovery.ts";
import { evaluateDirectaWatchdog } from "../lib/trading/watchdog.ts";

const now = Date.parse("2026-09-21T18:00:00.000Z");

const staleData = evaluateMarketDataQuorum([
  { source: "A", sourceFamily: "a", eligibility: "PAPER", price: 100, observedAt: new Date(now - 10 * 60_000).toISOString() },
  { source: "B", sourceFamily: "b", eligibility: "PAPER", price: 100.1, observedAt: new Date(now - 10 * 60_000).toISOString() },
], undefined, now);
assert.equal(staleData.allowNewRisk, false, "Stale market data must block new risk.");

const divergentData = evaluateMarketDataQuorum([
  { source: "A", sourceFamily: "a", eligibility: "PAPER", price: 100, observedAt: new Date(now - 5_000).toISOString() },
  { source: "B", sourceFamily: "b", eligibility: "PAPER", price: 103, observedAt: new Date(now - 5_000).toISOString() },
], undefined, now);
assert.equal(divergentData.allowNewRisk, false, "Cross-source divergence must block new risk.");

const fakeIndependence = evaluateMarketDataQuorum([
  { source: "Provider A primary", sourceFamily: "same-family", eligibility: "PAPER", price: 100, observedAt: new Date(now - 5_000).toISOString() },
  { source: "Provider A alias", sourceFamily: "same-family", eligibility: "PAPER", price: 100.05, observedAt: new Date(now - 4_000).toISOString() },
], undefined, now);
assert.equal(fakeIndependence.allowNewRisk, false, "Aliases from one provider family must never satisfy independent-source quorum.");

const validationOnly = evaluateMarketDataQuorum([
  { source: "A", sourceFamily: "a", eligibility: "PAPER", price: 100, observedAt: new Date(now - 5_000).toISOString() },
  { source: "EOD", sourceFamily: "stooq", eligibility: "VALIDATION_ONLY", price: 100.01, observedAt: new Date(now - 4_000).toISOString() },
], undefined, now);
assert.equal(validationOnly.allowNewRisk, false, "Fresh EOD/validation-only data must not masquerade as execution quorum.");

const criticalEvent = evaluateEventRisk([
  { id: "central-bank-shock", label: "Central bank emergency decision", scheduledAt: new Date(now).toISOString(), severity: "CRITICAL" },
], { symbol: "TEST", now });
assert.equal(criticalEvent.allowNewRisk, false, "Critical event window must block new risk.");

const concentrated = evaluatePortfolioRisk(10_000, [
  { symbol: "A", notionalEuro: 1_500, sector: "TECH", assetClass: "EQUITY" },
  { symbol: "B", notionalEuro: 1_500, sector: "TECH", assetClass: "EQUITY" },
  { symbol: "C", notionalEuro: 1_000, sector: "TECH", assetClass: "EQUITY" },
]);
assert.equal(concentrated.allowNewRisk, false, "Portfolio concentration must freeze risk.");

const brokerSnapshot = {
  generatedAt: new Date(now - 120_000).toISOString(),
  source: "directa-dapi-local",
  mode: "read-only",
  host: "loopback",
  tradingPort: 10002,
  liveTradingAllowed: false,
  writeCommandsBlocked: true,
  connection: { state: "CONN_OK", datafeedEnabled: false, release: "test", healthy: true },
  account: { identifierPersisted: false, identifierPresent: true, liquidity: 5000, gainEuro: 0, openProfitLoss: 0, equity: 5000 },
  availability: { equities: 5000, equitiesMargin: 5000, derivatives: 0, derivativesMargin: 0, totalLiquidity: 5000 },
  positions: [],
  orders: [],
  errors: [],
  diagnostics: { heartbeatCount: 1, unknownMessageTypes: [], receivedMessages: 1, stockListComplete: true, orderListComplete: true },
};
const staleBroker = evaluateDirectaWatchdog(brokerSnapshot, { maxSnapshotAgeSeconds: 15 }, now);
assert.equal(staleBroker.safeForShadow, false, "Stale broker state must disable shadow execution.");

const recovery = evaluateRecovery({
  auditChainValid: false,
  reconciliation: { balanced: false, breaks: [{ code: "POSITION", message: "simulated mismatch" }] },
  watchdog: staleBroker,
  unresolvedInternalOrders: 1,
  ambiguousExecutionState: true,
});
assert.equal(recovery.paperShadowAllowed, false, "Ambiguous recovery state must fail closed.");
assert.equal(recovery.liveAllowed, false, "Chaos recovery must never open live trading.");

console.log("Fenice chaos/adverse-condition resilience tests: PASS");
