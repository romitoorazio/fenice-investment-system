export type ConditionalOrderSide = "BUY" | "SELL";
export type ConditionalOrderKind = "LIMIT" | "STOP" | "STOP_LIMIT" | "TRAILING_STOP";
export type ConditionalOrderStatus = "WORKING" | "TRIGGERED" | "CANCELLED";

export type ConditionalOrder = {
  clientOrderId: string;
  symbol: string;
  side: ConditionalOrderSide;
  kind: ConditionalOrderKind;
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  trailPercent?: number;
  trailAmount?: number;
};

export type ConditionalActivation = {
  orderType: "MARKET" | "LIMIT";
  referencePrice: number;
  limitPrice?: number;
};

export type ConditionalOrderState = {
  order: ConditionalOrder;
  status: ConditionalOrderStatus;
  anchorPrice: number | null;
  triggeredAt: string | null;
  activation: ConditionalActivation | null;
};

export type OcoState = {
  groupId: string;
  status: "WORKING" | "TRIGGERED" | "CANCELLED" | "AMBIGUOUS";
  first: ConditionalOrderState;
  second: ConditionalOrderState;
  triggeredOrderId: string | null;
  reason: string | null;
};

function positive(value: unknown): boolean {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

export function validateConditionalOrder(order: ConditionalOrder): void {
  if (!order.clientOrderId || !order.symbol) throw new Error("INVALID_CONDITIONAL_ORDER: id and symbol are required");
  if (!positive(order.quantity)) throw new Error("INVALID_CONDITIONAL_ORDER: quantity must be positive");
  if (order.kind === "LIMIT" && !positive(order.limitPrice)) throw new Error("INVALID_CONDITIONAL_ORDER: LIMIT requires limitPrice");
  if (order.kind === "STOP" && !positive(order.stopPrice)) throw new Error("INVALID_CONDITIONAL_ORDER: STOP requires stopPrice");
  if (order.kind === "STOP_LIMIT" && (!positive(order.stopPrice) || !positive(order.limitPrice))) {
    throw new Error("INVALID_CONDITIONAL_ORDER: STOP_LIMIT requires stopPrice and limitPrice");
  }
  if (order.kind === "TRAILING_STOP") {
    const hasPercent = positive(order.trailPercent);
    const hasAmount = positive(order.trailAmount);
    if (hasPercent === hasAmount) {
      throw new Error("INVALID_CONDITIONAL_ORDER: TRAILING_STOP requires exactly one of trailPercent or trailAmount");
    }
    if (hasPercent && Number(order.trailPercent) >= 100) {
      throw new Error("INVALID_CONDITIONAL_ORDER: trailPercent must be below 100");
    }
  }
}

export function createConditionalOrderState(order: ConditionalOrder, initialMarketPrice?: number): ConditionalOrderState {
  validateConditionalOrder(order);
  const anchorPrice = order.kind === "TRAILING_STOP" && positive(initialMarketPrice)
    ? Number(initialMarketPrice)
    : null;
  return {
    order: structuredClone(order),
    status: "WORKING",
    anchorPrice,
    triggeredAt: null,
    activation: null,
  };
}

function shouldTrigger(order: ConditionalOrder, marketPrice: number, anchorPrice: number | null): boolean {
  switch (order.kind) {
    case "LIMIT":
      return order.side === "BUY" ? marketPrice <= Number(order.limitPrice) : marketPrice >= Number(order.limitPrice);
    case "STOP":
    case "STOP_LIMIT":
      return order.side === "BUY" ? marketPrice >= Number(order.stopPrice) : marketPrice <= Number(order.stopPrice);
    case "TRAILING_STOP": {
      if (!positive(anchorPrice)) return false;
      const threshold = positive(order.trailPercent)
        ? Number(anchorPrice) * Number(order.trailPercent) / 100
        : Number(order.trailAmount);
      const triggerPrice = order.side === "SELL"
        ? Number(anchorPrice) - threshold
        : Number(anchorPrice) + threshold;
      return order.side === "SELL" ? marketPrice <= triggerPrice : marketPrice >= triggerPrice;
    }
  }
}

function activationFor(order: ConditionalOrder, marketPrice: number): ConditionalActivation {
  if (order.kind === "LIMIT" || order.kind === "STOP_LIMIT") {
    return {
      orderType: "LIMIT",
      referencePrice: marketPrice,
      limitPrice: Number(order.limitPrice),
    };
  }
  return { orderType: "MARKET", referencePrice: marketPrice };
}

export function applyConditionalMarketPrice(
  state: ConditionalOrderState,
  marketPrice: number,
  observedAt: string,
): ConditionalOrderState {
  if (state.status !== "WORKING") return state;
  if (!positive(marketPrice) || !Number.isFinite(Date.parse(observedAt))) {
    throw new Error("INVALID_MARKET_EVIDENCE: positive price and valid observedAt are required");
  }

  let anchorPrice = state.anchorPrice;
  if (state.order.kind === "TRAILING_STOP") {
    if (!positive(anchorPrice)) anchorPrice = marketPrice;
    else if (state.order.side === "SELL") anchorPrice = Math.max(Number(anchorPrice), marketPrice);
    else anchorPrice = Math.min(Number(anchorPrice), marketPrice);
  }

  if (!shouldTrigger(state.order, marketPrice, anchorPrice)) {
    return { ...state, anchorPrice };
  }

  return {
    ...state,
    anchorPrice,
    status: "TRIGGERED",
    triggeredAt: observedAt,
    activation: activationFor(state.order, marketPrice),
  };
}

export function cancelConditionalOrder(state: ConditionalOrderState): ConditionalOrderState {
  if (state.status !== "WORKING") return state;
  return { ...state, status: "CANCELLED" };
}

export function createOcoState(groupId: string, first: ConditionalOrder, second: ConditionalOrder, initialMarketPrice?: number): OcoState {
  if (!groupId) throw new Error("INVALID_OCO: groupId is required");
  if (first.clientOrderId === second.clientOrderId) throw new Error("INVALID_OCO: child order IDs must be unique");
  if (first.symbol !== second.symbol) throw new Error("INVALID_OCO: both legs must reference the same symbol");
  return {
    groupId,
    status: "WORKING",
    first: createConditionalOrderState(first, initialMarketPrice),
    second: createConditionalOrderState(second, initialMarketPrice),
    triggeredOrderId: null,
    reason: null,
  };
}

export function applyOcoMarketPrice(state: OcoState, marketPrice: number, observedAt: string): OcoState {
  if (state.status !== "WORKING") return state;
  const first = applyConditionalMarketPrice(state.first, marketPrice, observedAt);
  const second = applyConditionalMarketPrice(state.second, marketPrice, observedAt);
  const firstTriggered = first.status === "TRIGGERED";
  const secondTriggered = second.status === "TRIGGERED";

  if (firstTriggered && secondTriggered) {
    return {
      ...state,
      status: "AMBIGUOUS",
      first,
      second,
      triggeredOrderId: null,
      reason: "both OCO legs triggered on the same market observation; fail-closed reconciliation required",
    };
  }
  if (firstTriggered) {
    return {
      ...state,
      status: "TRIGGERED",
      first,
      second: cancelConditionalOrder(second),
      triggeredOrderId: first.order.clientOrderId,
      reason: null,
    };
  }
  if (secondTriggered) {
    return {
      ...state,
      status: "TRIGGERED",
      first: cancelConditionalOrder(first),
      second,
      triggeredOrderId: second.order.clientOrderId,
      reason: null,
    };
  }
  return { ...state, first, second };
}

export function createLongBracketOco(input: {
  groupId: string;
  symbol: string;
  quantity: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  initialMarketPrice?: number;
}): OcoState {
  if (!positive(input.takeProfitPrice) || !positive(input.stopLossPrice) || !positive(input.quantity)) {
    throw new Error("INVALID_BRACKET: positive quantity, take-profit and stop-loss prices are required");
  }
  if (Number(input.takeProfitPrice) <= Number(input.stopLossPrice)) {
    throw new Error("INVALID_BRACKET: take-profit must be above stop-loss for a long bracket");
  }
  return createOcoState(
    input.groupId,
    {
      clientOrderId: `${input.groupId}:take-profit`,
      symbol: input.symbol,
      side: "SELL",
      kind: "LIMIT",
      quantity: input.quantity,
      limitPrice: input.takeProfitPrice,
    },
    {
      clientOrderId: `${input.groupId}:stop-loss`,
      symbol: input.symbol,
      side: "SELL",
      kind: "STOP",
      quantity: input.quantity,
      stopPrice: input.stopLossPrice,
    },
    input.initialMarketPrice,
  );
}
