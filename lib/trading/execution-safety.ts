export type ExecutionSafetyLimits = {
  maxOrderQuantity: number;
  maxPriceDeviationPercent: number;
  maxOrdersPerMinute: number;
  cashReservePercent: number;
};

export type ExecutionSafetyInput = {
  side: "BUY" | "SELL";
  quantity: number;
  orderPrice: number;
  marketReferencePrice: number;
  availableCashEuro: number;
  orderNotionalEuro: number;
  marketSessionOpen: boolean;
  quoteFresh: boolean;
  ordersLastMinute: number;
  ambiguousPriorExecution: boolean;
};

export type ExecutionSafetyDecision = {
  allowed: boolean;
  reasons: string[];
  metrics: {
    priceDeviationPercent: number;
    cashAfterOrderEuro: number;
    requiredReserveEuro: number;
  };
};

export const DEFAULT_EXECUTION_SAFETY_LIMITS: ExecutionSafetyLimits = {
  maxOrderQuantity: 10_000,
  maxPriceDeviationPercent: 3,
  maxOrdersPerMinute: 6,
  cashReservePercent: 2,
};

const finitePositive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;

export function evaluateExecutionSafety(
  input: ExecutionSafetyInput,
  limits: ExecutionSafetyLimits = DEFAULT_EXECUTION_SAFETY_LIMITS,
): ExecutionSafetyDecision {
  const reasons: string[] = [];
  const quantity = Number(input.quantity);
  const orderPrice = Number(input.orderPrice);
  const marketReferencePrice = Number(input.marketReferencePrice);
  const availableCashEuro = Number(input.availableCashEuro);
  const orderNotionalEuro = Number(input.orderNotionalEuro);

  if (!finitePositive(quantity) || quantity > limits.maxOrderQuantity) {
    reasons.push("fat-finger quantity limit exceeded or invalid quantity");
  }
  if (!finitePositive(orderPrice) || !finitePositive(marketReferencePrice)) {
    reasons.push("invalid order or market reference price");
  }

  const priceDeviationPercent = finitePositive(orderPrice) && finitePositive(marketReferencePrice)
    ? Math.abs((orderPrice - marketReferencePrice) / marketReferencePrice) * 100
    : Number.POSITIVE_INFINITY;
  if (priceDeviationPercent > limits.maxPriceDeviationPercent) {
    reasons.push("price reasonability collar exceeded");
  }
  if (!input.marketSessionOpen) reasons.push("market/session gate closed");
  if (!input.quoteFresh) reasons.push("quote is stale");
  if (input.ambiguousPriorExecution) reasons.push("ambiguous prior execution requires reconciliation before another order");
  if (!Number.isFinite(input.ordersLastMinute) || input.ordersLastMinute < 0 || input.ordersLastMinute >= limits.maxOrdersPerMinute) {
    reasons.push("order message-rate limit reached");
  }

  const requiredReserveEuro = Number.isFinite(availableCashEuro)
    ? Math.max(0, availableCashEuro * limits.cashReservePercent / 100)
    : Number.POSITIVE_INFINITY;
  const cashAfterOrderEuro = input.side === "BUY"
    ? availableCashEuro - orderNotionalEuro
    : availableCashEuro;
  if (input.side === "BUY" && (!Number.isFinite(availableCashEuro) || !Number.isFinite(orderNotionalEuro) || cashAfterOrderEuro < requiredReserveEuro)) {
    reasons.push("insufficient buying power after required cash reserve");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    metrics: {
      priceDeviationPercent: Number.isFinite(priceDeviationPercent) ? Number(priceDeviationPercent.toFixed(4)) : 999,
      cashAfterOrderEuro: Number.isFinite(cashAfterOrderEuro) ? Number(cashAfterOrderEuro.toFixed(2)) : -1,
      requiredReserveEuro: Number.isFinite(requiredReserveEuro) ? Number(requiredReserveEuro.toFixed(2)) : -1,
    },
  };
}
