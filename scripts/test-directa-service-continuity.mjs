import assert from "node:assert/strict";
import { assessDirectaServiceContinuity } from "../lib/ui/directa-service-continuity.ts";

const now = Date.parse("2026-10-13T15:00:00.000Z");
const base = {
  snapshot: {
    generatedAt: "2026-10-13T14:59:57.000Z",
    source: "directa-dapi-local",
    mode: "read-only",
    host: "loopback",
    tradingPort: 10001,
    liveTradingAllowed: false,
    writeCommandsBlocked: true,
    connection: { state: "CONN_OK", healthy: true, datafeedEnabled: false, release: "test" },
    account: { identifierPersisted: false, identifierPresent: true, liquidity: 1000, gainEuro: 0, openProfitLoss: 0, equity: 1000 },
    availability: { equities: 1000, equitiesMargin: 0, derivatives: 0, derivativesMargin: 0, totalLiquidity: 1000 },
    positions: [],
    orders: [],
    errors: [],
    diagnostics: { heartbeatCount: 0, unknownMessageTypes: [], receivedMessages: 8, stockListComplete: true, orderListComplete: true },
  },
  reconciliation: { balanced: true, breaks: [], observedAt: "2026-10-13T14:59:57.000Z" },
  auditChainValid: true,
  unresolvedInternalOrders: 0,
  ambiguousPriorExecution: false,
  serviceInterruptionObserved: false,
};

const checkBlocked = (input, reason) => {
  const result = assessDirectaServiceContinuity(input, now);
  assert.equal(result.readOnlyEvidenceVerified, false, reason);
  assert.equal(result.paperOrdersAuthorized, false);
  assert.equal(result.brokerWritesAuthorized, false);
  assert.equal(result.liveTradingAllowed, false);
  assert.ok(result.reasons.length > 0);
};

const absent = assessDirectaServiceContinuity({}, now);
assert.equal(absent.state, "NOT_VERIFIED", "Remote deployment must not pretend Directa is locally connected");
checkBlocked({}, "Absent Directa evidence");

const observed = assessDirectaServiceContinuity(base, now);
assert.equal(observed.state, "READ_ONLY_VERIFIED");
assert.equal(observed.readOnlyEvidenceVerified, true);
assert.equal(observed.paperOrdersAuthorized, false);
assert.equal(observed.brokerWritesAuthorized, false);
assert.equal(observed.liveTradingAllowed, false);

checkBlocked({ ...base, snapshot: { ...base.snapshot, generatedAt: "2026-10-13T15:00:10.000Z" } }, "Future broker snapshot");
checkBlocked({ ...base, snapshot: { ...base.snapshot, generatedAt: "2026-10-13T14:59:40.000Z" } }, "Stale broker snapshot");
checkBlocked({ ...base, snapshot: { ...base.snapshot, connection: { ...base.snapshot.connection, healthy: false } } }, "Broker outage");
checkBlocked({ ...base, snapshot: { ...base.snapshot, diagnostics: { ...base.snapshot.diagnostics, orderListComplete: false } } }, "Partial order list");
checkBlocked({ ...base, snapshot: { ...base.snapshot, errors: [{ ticker: "TEST", code: 1024 }] } }, "Protocol errors");
checkBlocked({ ...base, snapshot: { ...base.snapshot, mode: "live" } }, "Write capable bridge");
checkBlocked({ ...base, reconciliation: { ...base.reconciliation, balanced: false } }, "Reconciliation breaks");
checkBlocked({ ...base, reconciliation: { ...base.reconciliation, observedAt: "2026-10-13T14:59:55.000Z" } }, "Old reconciliation");
checkBlocked({ ...base, reconciliation: { ...base.reconciliation, breaks: [{ code: "OPEN_ORDER", key: "x", expected: true, actual: false }] } }, "Inconsistent balanced flag");
checkBlocked({ ...base, unresolvedInternalOrders: 1 }, "Unknown order outcome");
checkBlocked({ ...base, unresolvedInternalOrders: -1 }, "Malformed order count");
checkBlocked({ ...base, ambiguousPriorExecution: true }, "Ambiguous order state");
checkBlocked({ ...base, auditChainValid: false }, "Broken audit chain");
checkBlocked({ ...base, serviceInterruptionObserved: undefined }, "Missing broker incident status");
checkBlocked({ ...base, serviceInterruptionObserved: true }, "No human recovery review");
checkBlocked({ ...base, serviceInterruptionObserved: true, operatorRecoveryReviewedAt: "2026-10-13T14:59:50.000Z" }, "Review before latest snapshot");
checkBlocked({ ...base, serviceInterruptionObserved: true, operatorRecoveryReviewedAt: "2026-10-13T15:00:05.000Z" }, "Future-dated operator review");
const reviewed = assessDirectaServiceContinuity({
  ...base,
  serviceInterruptionObserved: true,
  operatorRecoveryReviewedAt: "2026-10-13T14:59:59.000Z",
}, now);
assert.equal(reviewed.readOnlyEvidenceVerified, true, "A verified post-incident human read-only review may be informationally accepted");
assert.equal(reviewed.paperOrdersAuthorized, false);
assert.equal(reviewed.liveTradingAllowed, false);

console.log("Directa independent service-continuity fail-closed regression: PASS");
