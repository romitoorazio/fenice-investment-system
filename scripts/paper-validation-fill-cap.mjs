const PAPER_OMS_SIMULATED_BUY_SLIPPAGE_BPS = 5;
const QUANTITY_SCALE = 1_000_000;

function positive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function floorQuantity(value) {
  return Math.floor(Number(value) * QUANTITY_SCALE) / QUANTITY_SCALE;
}

/**
 * Tightens an already-approved validation probe so the deterministic PAPER OMS
 * BUY fill (5 bps adverse slippage) remains inside the operator-approved hard
 * notional cap. The PAPER OMS implementation and its 5 bps default are part of
 * the campaign fingerprint; if that core changes, campaign validation fails
 * independently rather than silently widening this allowance.
 *
 * This helper can only reduce quantity. It never creates an order, widens an
 * approval, enables broker connectivity or changes LIVE permissions.
 */
export function reservePaperValidationFillCap(result, approval) {
  if (!result?.staged) return result;

  const order = result?.order;
  const rationale = order?.validationRationale;
  const cap = Number(approval?.maxNotionalEuroPerOrder);
  const referencePrice = Number(rationale?.medianPrice);
  const fxToEuro = Number(order?.fxToEuro);
  const requestedQuantity = Number(order?.quantity);

  if (order?.validationProbe !== true
    || order?.side !== "BUY"
    || !positive(cap)
    || !positive(referencePrice)
    || !positive(fxToEuro)
    || !positive(requestedQuantity)) {
    return { staged: false, reason: "probe-fill-cap-input-invalid", queue: result?.queue };
  }

  const fillFactor = 1 + PAPER_OMS_SIMULATED_BUY_SLIPPAGE_BPS / 10_000;
  const maxQuantityAtFill = cap / (referencePrice * fxToEuro * fillFactor);
  const quantity = Math.min(requestedQuantity, floorQuantity(maxQuantityAtFill));
  if (!positive(quantity)) {
    return { staged: false, reason: "probe-size-too-small-after-fill-cap", queue: result?.queue };
  }

  const referenceNotionalEuro = quantity * referencePrice * fxToEuro;
  const simulatedFillNotionalEuro = referenceNotionalEuro * fillFactor;
  if (simulatedFillNotionalEuro > cap + 1e-8) {
    return { staged: false, reason: "probe-fill-cap-not-provable", queue: result?.queue };
  }

  const tightenedOrder = {
    ...order,
    quantity,
    validationRationale: {
      ...rationale,
      hardFillNotionalCapEuro: Number(cap.toFixed(2)),
      simulatedBuySlippageReserveBps: PAPER_OMS_SIMULATED_BUY_SLIPPAGE_BPS,
      referenceNotionalEuro: Number(referenceNotionalEuro.toFixed(4)),
      maxSimulatedFillNotionalEuro: Number(simulatedFillNotionalEuro.toFixed(4)),
    },
  };

  const queueOrders = Array.isArray(result?.queue?.orders) ? result.queue.orders : [];
  const tightenedQueue = {
    ...result.queue,
    orders: queueOrders.map((queued) => queued?.clientOrderId === order.clientOrderId ? tightenedOrder : queued),
  };

  return { ...result, order: tightenedOrder, queue: tightenedQueue };
}
