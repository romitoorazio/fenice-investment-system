// Local-only diagnostic. Never authorizes broker orders or exposes account values.
const MAX_AGE_MS = 15_000;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function parseCanonical(value) {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms >= 0 && new Date(ms).toISOString() === value ? ms : null;
}
const finiteAmount = (value) => typeof value === "number" && Number.isFinite(value);
const nonblank = (value) => typeof value === "string"
  && value.trim().length > 0 && value.length <= 128;
const knownOrderStates = new Map([
  [2000, "IN_NEGOTIATION"], [2001, "SUBMISSION_ERROR"],
  [2002, "IN_NEGOTIATION_AFTER_CONFIRMATION"], [2003, "FILLED"],
  [2004, "CANCELLED"], [2005, "AWAITING_CONFIRMATION"], [2006, "MODIFIED"],
]);
// This local read-only summary must never certify partial position/order rows.
// Provider-specific timestamps may not be ISO; require presence, not invented UTC.
const validPosition = (position) => {
  if (!position || typeof position !== "object" || Array.isArray(position)
    || !nonblank(position.ticker) || !nonblank(position.observedAt)) return false;
  const portfolio = position.portfolioQuantity;
  const directa = position.directaQuantity;
  if (!finiteAmount(portfolio) && !finiteAmount(directa)) return false;
  if (portfolio !== null && portfolio !== undefined && !finiteAmount(portfolio)) return false;
  if (directa !== null && directa !== undefined && !finiteAmount(directa)) return false;
  const held = (finiteAmount(portfolio) && portfolio !== 0)
    || (finiteAmount(directa) && directa !== 0);
  return !held || (finiteAmount(position.averagePrice) && position.averagePrice > 0);
};
const validOrder = (order) => {
  if (!order || typeof order !== "object" || Array.isArray(order)
    || !nonblank(order.ticker) || !nonblank(order.observedAt)
    || !nonblank(order.operation)
    || !(nonblank(order.clientOrderId) || nonblank(order.brokerReference))
    || !finiteAmount(order.quantity) || order.quantity <= 0) return false;
  return knownOrderStates.get(order.stateCode) === order.state;
};

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
  } else {
    if (snapshot.positions.some(position => !validPosition(position)))
      failures.push("BROKER_POSITION_ROWS_INCOMPLETE");
    if (snapshot.orders.some(order => !order || typeof order !== "object"
      || !knownOrderStates.has(order.stateCode) || order.state === "UNKNOWN"))
      failures.push("BROKER_ORDER_STATE_AMBIGUOUS");
    if (snapshot.orders.some(order => !validOrder(order)))
      failures.push("BROKER_ORDER_ROWS_INCOMPLETE");
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
