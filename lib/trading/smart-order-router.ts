export type RouterSide = "BUY" | "SELL";
export type RouterOrderType = "MARKET" | "LIMIT";
export type RouterEligibility = "VALIDATION_ONLY" | "PAPER";

export type RoutingIntent = {
  clientOrderId: string;
  symbol: string;
  side: RouterSide;
  orderType: RouterOrderType;
  quantity: number;
  limitPrice?: number;
  currency: string;
  directedVenueId?: string;
};

export type VenueQuote = {
  venueId: string;
  mic?: string;
  sourceFamily: string;
  currency: string;
  eligibility: RouterEligibility;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  feeBps: number;
  estimatedSlippageBps: number;
  fillProbability: number;
  latencyMs: number;
  observedAt: string;
  tradingStatus: "OPEN" | "HALTED" | "CLOSED";
};

export type SmartOrderRouterPolicy = {
  requiredEligibility: "PAPER";
  maxQuoteAgeMs: number;
  minFillProbability: number;
  maxVenues: number;
  nearPriceToleranceBps: number;
  allowPartial: boolean;
};

export type RouteLeg = {
  venueId: string;
  mic?: string;
  quantity: number;
  marketPrice: number;
  effectiveUnitPrice: number;
  estimatedConsideration: number;
  fillProbability: number;
  latencyMs: number;
  observedAt: string;
};

export type SmartOrderRoutePlan = {
  clientOrderId: string;
  symbol: string;
  side: RouterSide;
  status: "ROUTABLE" | "PARTIAL" | "BLOCKED";
  directed: boolean;
  requestedQuantity: number;
  routedQuantity: number;
  unroutedQuantity: number;
  benchmarkMarketPrice: number | null;
  estimatedTotalConsideration: number | null;
  legs: RouteLeg[];
  rejectedVenues: Array<{ venueId: string; reasons: string[] }>;
  reasons: string[];
  bestExecutionFactors: readonly ["price", "costs", "speed", "likelihood", "size", "nature"];
  mode: "SHADOW_ONLY";
  transmitted: false;
  liveTradingAllowed: false;
};

export const DEFAULT_SMART_ORDER_ROUTER_POLICY: SmartOrderRouterPolicy = {
  requiredEligibility: "PAPER",
  maxQuoteAgeMs: 5_000,
  minFillProbability: 0.5,
  maxVenues: 4,
  nearPriceToleranceBps: 1,
  allowPartial: false,
};

function positive(value: unknown): boolean {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function nonNegative(value: unknown): boolean {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function normalizeSymbol(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function quoteAgeMs(observedAt: string, nowMs: number): number {
  const timestamp = Date.parse(observedAt);
  return Number.isFinite(timestamp) ? nowMs - timestamp : Number.POSITIVE_INFINITY;
}

function marketPrice(side: RouterSide, quote: VenueQuote): number {
  return side === "BUY" ? Number(quote.ask) : Number(quote.bid);
}

function availableSize(side: RouterSide, quote: VenueQuote): number {
  return side === "BUY" ? Number(quote.askSize) : Number(quote.bidSize);
}

function effectiveUnitPrice(side: RouterSide, quote: VenueQuote): number {
  const price = marketPrice(side, quote);
  const costBps = Number(quote.feeBps) + Number(quote.estimatedSlippageBps);
  const multiplier = side === "BUY" ? 1 + costBps / 10_000 : 1 - costBps / 10_000;
  return price * multiplier;
}

function withinLimit(intent: RoutingIntent, price: number): boolean {
  if (intent.orderType !== "LIMIT") return true;
  if (!positive(intent.limitPrice)) return false;
  return intent.side === "BUY" ? price <= Number(intent.limitPrice) : price >= Number(intent.limitPrice);
}

function validateIntent(intent: RoutingIntent): string[] {
  const reasons: string[] = [];
  if (!intent.clientOrderId) reasons.push("clientOrderId is required");
  if (!normalizeSymbol(intent.symbol)) reasons.push("symbol is required");
  if (!positive(intent.quantity)) reasons.push("quantity must be positive");
  if (!String(intent.currency || "").trim()) reasons.push("currency is required");
  if (intent.orderType === "LIMIT" && !positive(intent.limitPrice)) reasons.push("LIMIT order requires a positive limitPrice");
  return reasons;
}

function candidateReasons(intent: RoutingIntent, quote: VenueQuote, policy: SmartOrderRouterPolicy, nowMs: number): string[] {
  const reasons: string[] = [];
  if (!quote.venueId) reasons.push("venueId missing");
  if (quote.tradingStatus !== "OPEN") reasons.push(`venue ${quote.tradingStatus.toLowerCase()}`);
  if (quote.eligibility !== policy.requiredEligibility) reasons.push(`eligibility ${quote.eligibility} != ${policy.requiredEligibility}`);
  if (String(quote.currency || "").toUpperCase() !== String(intent.currency || "").toUpperCase()) reasons.push("currency mismatch");
  if (!positive(quote.bid) || !positive(quote.ask) || Number(quote.ask) < Number(quote.bid)) reasons.push("invalid bid/ask");
  if (!positive(availableSize(intent.side, quote))) reasons.push("no executable top-of-book size");
  if (!nonNegative(quote.feeBps) || !nonNegative(quote.estimatedSlippageBps)) reasons.push("invalid execution cost estimate");
  if (!Number.isFinite(Number(quote.fillProbability)) || Number(quote.fillProbability) < policy.minFillProbability || Number(quote.fillProbability) > 1) {
    reasons.push("fill probability below policy or invalid");
  }
  if (!nonNegative(quote.latencyMs)) reasons.push("invalid latency");
  const age = quoteAgeMs(quote.observedAt, nowMs);
  if (!Number.isFinite(age) || age < 0 || age > policy.maxQuoteAgeMs) reasons.push("stale or invalid quote timestamp");
  if (positive(marketPrice(intent.side, quote)) && !withinLimit(intent, marketPrice(intent.side, quote))) reasons.push("not executable within limit price");
  return reasons;
}

function compareCandidates(side: RouterSide, a: VenueQuote, b: VenueQuote, nearPriceToleranceBps: number): number {
  const aEffective = effectiveUnitPrice(side, a);
  const bEffective = effectiveUnitPrice(side, b);
  const best = side === "BUY" ? Math.min(aEffective, bEffective) : Math.max(aEffective, bEffective);
  const differenceBps = best > 0 ? Math.abs(aEffective - bEffective) / best * 10_000 : Number.POSITIVE_INFINITY;

  if (differenceBps > nearPriceToleranceBps) {
    return side === "BUY" ? aEffective - bEffective : bEffective - aEffective;
  }
  if (Number(a.fillProbability) !== Number(b.fillProbability)) return Number(b.fillProbability) - Number(a.fillProbability);
  if (Number(a.latencyMs) !== Number(b.latencyMs)) return Number(a.latencyMs) - Number(b.latencyMs);
  const sizeDifference = availableSize(side, b) - availableSize(side, a);
  if (sizeDifference !== 0) return sizeDifference;
  return a.venueId.localeCompare(b.venueId);
}

export function buildSmartOrderRoutePlan(
  intent: RoutingIntent,
  quotes: readonly VenueQuote[],
  policy: SmartOrderRouterPolicy = DEFAULT_SMART_ORDER_ROUTER_POLICY,
  now = new Date().toISOString(),
): SmartOrderRoutePlan {
  const nowMs = Date.parse(now);
  const baseReasons = validateIntent(intent);
  if (!Number.isFinite(nowMs)) baseReasons.push("router clock is invalid");
  if (!Number.isFinite(Number(policy.maxQuoteAgeMs)) || Number(policy.maxQuoteAgeMs) <= 0) baseReasons.push("invalid maxQuoteAgeMs policy");
  if (!Number.isFinite(Number(policy.maxVenues)) || Number(policy.maxVenues) < 1) baseReasons.push("invalid maxVenues policy");
  if (!nonNegative(policy.nearPriceToleranceBps)) baseReasons.push("invalid nearPriceToleranceBps policy");

  const rejectedVenues: Array<{ venueId: string; reasons: string[] }> = [];
  const eligible: VenueQuote[] = [];
  for (const quote of Array.isArray(quotes) ? quotes : []) {
    const reasons = candidateReasons(intent, quote, policy, nowMs);
    if (intent.directedVenueId && quote.venueId !== intent.directedVenueId) reasons.push("excluded by client-directed venue instruction");
    if (reasons.length > 0) rejectedVenues.push({ venueId: quote.venueId || "UNKNOWN", reasons });
    else eligible.push(quote);
  }

  if (intent.directedVenueId && !eligible.some((quote) => quote.venueId === intent.directedVenueId)) {
    baseReasons.push("client-directed venue is unavailable or ineligible");
  }
  if (eligible.length === 0) baseReasons.push("no eligible execution venue");

  const sorted = [...eligible].sort((a, b) => compareCandidates(intent.side, a, b, policy.nearPriceToleranceBps));
  const legs: RouteLeg[] = [];
  let remaining = Math.max(0, Number(intent.quantity) || 0);

  for (const quote of sorted.slice(0, Math.max(1, Math.floor(policy.maxVenues)))) {
    if (remaining <= 0) break;
    const quantity = Math.min(remaining, availableSize(intent.side, quote));
    if (!positive(quantity)) continue;
    const unitPrice = effectiveUnitPrice(intent.side, quote);
    legs.push({
      venueId: quote.venueId,
      mic: quote.mic,
      quantity,
      marketPrice: marketPrice(intent.side, quote),
      effectiveUnitPrice: unitPrice,
      estimatedConsideration: quantity * unitPrice,
      fillProbability: Number(quote.fillProbability),
      latencyMs: Number(quote.latencyMs),
      observedAt: quote.observedAt,
    });
    remaining -= quantity;
  }

  const routedQuantity = legs.reduce((sum, leg) => sum + leg.quantity, 0);
  const unroutedQuantity = Math.max(0, Number(intent.quantity) - routedQuantity);
  if (unroutedQuantity > 0 && !policy.allowPartial) baseReasons.push("insufficient eligible liquidity for full requested quantity");

  let status: SmartOrderRoutePlan["status"];
  if (baseReasons.length > 0 || routedQuantity <= 0) status = "BLOCKED";
  else if (unroutedQuantity > 0) status = "PARTIAL";
  else status = "ROUTABLE";

  const finalLegs = status === "BLOCKED" && !policy.allowPartial ? [] : legs;
  const finalRoutedQuantity = finalLegs.reduce((sum, leg) => sum + leg.quantity, 0);
  const finalUnroutedQuantity = Math.max(0, Number(intent.quantity) - finalRoutedQuantity);
  const total = finalLegs.reduce((sum, leg) => sum + leg.estimatedConsideration, 0);

  return {
    clientOrderId: intent.clientOrderId,
    symbol: normalizeSymbol(intent.symbol),
    side: intent.side,
    status,
    directed: Boolean(intent.directedVenueId),
    requestedQuantity: Number(intent.quantity),
    routedQuantity: finalRoutedQuantity,
    unroutedQuantity: finalUnroutedQuantity,
    benchmarkMarketPrice: finalLegs.length > 0 ? finalLegs[0].marketPrice : null,
    estimatedTotalConsideration: finalLegs.length > 0 ? total : null,
    legs: finalLegs,
    rejectedVenues,
    reasons: baseReasons,
    bestExecutionFactors: ["price", "costs", "speed", "likelihood", "size", "nature"],
    mode: "SHADOW_ONLY",
    transmitted: false,
    liveTradingAllowed: false,
  };
}
