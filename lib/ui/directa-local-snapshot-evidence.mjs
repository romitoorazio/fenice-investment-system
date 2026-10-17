// Local-only diagnostic. Never authorizes broker orders or exposes account values.
const MAX_AGE_MS = 15_000;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function parseCanonical(value) {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms >= 0 && new Date(ms).toISOString() === value ? ms : null;
}
const finiteAmount = (value) => typeof value === "number" && Number.isFinite(value);

export function assessDirectaLocalSnapshotEvidence(snapshot, now = Date.now()) {
  const invariant = {
    diagnosticOnly: true,
    brokerReconciliationVerified: false,
    brokerWritesAuthorized: false,
    liveTradingAllowed: false,
  };
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { state: "MISSING", complete: false, current: false, ageSeconds: null,
      positionsObserved: null, ordersObserved: null, failures: ["LOCAL_SNAPSHOT_MISSING"], ...invariant };
  }
  const failures = [];
  const nowValid = Number.isSafeInteger(now) && now >= 0 && now <= 8.64e15;
  const observedAt = parseCanonical(snapshot.generatedAt);
  const ageMs = observedAt === null || !nowValid ? null : now - observedAt;
  const current = ageMs !== null && ageMs >= 0 && ageMs <= MAX_AGE_MS;
  if (!current) failures.push("LOCAL_SNAPSHOT_STALE_OR_INVALID_CLOCK");

  if (snapshot.source !== "directa-dapi-local" || snapshot.mode !== "read-only"
    || snapshot.host !== "loopback" || snapshot.liveTradingAllowed !== false
    || snapshot.writeCommandsBlocked !== true) failures.push("READ_ONLY_BOUNDARY_UNVERIFIED");
  if (snapshot.connection?.healthy !== true || snapshot.connection?.state !== "CONN_OK") {
    failures.push("BROKER_CONNECTION_UNHEALTHY");
  }
  if (snapshot.diagnostics?.stockListComplete !== true
    || snapshot.diagnostics?.orderListComplete !== true
    || !Number.isSafeInteger(snapshot.diagnostics?.receivedMessages)
    || snapshot.diagnostics.receivedMessages <= 0) failures.push("BROKER_LISTS_INCOMPLETE");
  if (!snapshot.account || snapshot.account.identifierPersisted !== false
    || snapshot.account.identifierPresent !== true
    || !finiteAmount(snapshot.account.liquidity) || !finiteAmount(snapshot.account.equity)
    || !snapshot.availability || !finiteAmount(snapshot.availability.totalLiquidity)) {
    failures.push("BROKER_ACCOUNT_FIELDS_INCOMPLETE");
  }
  if (!Array.isArray(snapshot.positions) || !Array.isArray(snapshot.orders)) {
    failures.push("BROKER_COLLECTIONS_MISSING");
  } else if (snapshot.orders.some((order) => !order || !order.state || order.state === "UNKNOWN")) {
    failures.push("BROKER_ORDER_STATE_AMBIGUOUS");
  }
  if (!Array.isArray(snapshot.errors) || snapshot.errors.length !== 0) {
    failures.push("BROKER_PROTOCOL_ERRORS");
  }
  return {
    state: failures.length === 0 ? "CURRENT_COMPLETE" : current ? "INCOMPLETE" : "STALE_OR_INVALID",
    complete: failures.length === 0, current,
    ageSeconds: ageMs === null || ageMs < 0 ? null : Math.round(ageMs / 100) / 10,
    positionsObserved: Array.isArray(snapshot.positions) ? snapshot.positions.length : null,
    ordersObserved: Array.isArray(snapshot.orders) ? snapshot.orders.length : null,
    failures, ...invariant,
  };
}
