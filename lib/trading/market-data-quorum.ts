export type MarketDataEvidence = {
  source: string;
  price: number;
  observedAt: string;
};

export type MarketDataQuorumLimits = {
  minIndependentSources: number;
  preferredIndependentSources: number;
  maxQuoteAgeSeconds: number;
  maxSpreadPercent: number;
};

export type MarketDataQuorumState = "GREEN" | "CAUTION" | "BLOCKED";

export type MarketDataQuorumDecision = {
  state: MarketDataQuorumState;
  allowNewRisk: boolean;
  independentSources: number;
  medianPrice: number | null;
  maxSpreadPercent: number | null;
  staleEvidence: number;
  invalidEvidence: number;
  reasons: string[];
};

export const DEFAULT_MARKET_DATA_QUORUM_LIMITS: MarketDataQuorumLimits = {
  minIndependentSources: 2,
  preferredIndependentSources: 3,
  maxQuoteAgeSeconds: 120,
  maxSpreadPercent: 0.75,
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function finitePositive(value: unknown): value is number {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

export function evaluateMarketDataQuorum(
  evidence: readonly MarketDataEvidence[],
  limits: MarketDataQuorumLimits = DEFAULT_MARKET_DATA_QUORUM_LIMITS,
  now = Date.now(),
): MarketDataQuorumDecision {
  const reasons: string[] = [];
  const freshestBySource = new Map<string, { source: string; price: number; observedAtMs: number }>();
  let invalidEvidence = 0;

  for (const item of evidence) {
    const source = String(item?.source || "").trim();
    const observedAtMs = Date.parse(String(item?.observedAt || ""));
    const price = Number(item?.price);
    if (!source || !finitePositive(price) || !Number.isFinite(observedAtMs)) {
      invalidEvidence += 1;
      continue;
    }
    const normalizedSource = source.toLowerCase();
    const previous = freshestBySource.get(normalizedSource);
    if (!previous || observedAtMs > previous.observedAtMs) {
      freshestBySource.set(normalizedSource, { source, price, observedAtMs });
    }
  }

  const uniqueEvidence = [...freshestBySource.values()];
  const fresh = uniqueEvidence.filter((item) => Math.max(0, (now - item.observedAtMs) / 1000) <= limits.maxQuoteAgeSeconds);
  const staleEvidence = uniqueEvidence.length - fresh.length;

  if (fresh.length < limits.minIndependentSources) {
    reasons.push(`insufficient independent fresh market-data sources: ${fresh.length}/${limits.minIndependentSources}`);
  }

  let medianPrice: number | null = null;
  let maxSpreadPercent: number | null = null;
  if (fresh.length > 0) {
    const prices = fresh.map((item) => item.price);
    medianPrice = median(prices);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    maxSpreadPercent = medianPrice > 0 ? ((maxPrice - minPrice) / medianPrice) * 100 : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(maxSpreadPercent) || maxSpreadPercent > limits.maxSpreadPercent) {
      reasons.push(`cross-source price spread exceeds limit: ${Number.isFinite(maxSpreadPercent) ? maxSpreadPercent.toFixed(4) : "invalid"}% > ${limits.maxSpreadPercent}%`);
    }
  }

  if (staleEvidence > 0) reasons.push(`${staleEvidence} source(s) excluded as stale`);
  if (invalidEvidence > 0) reasons.push(`${invalidEvidence} invalid evidence item(s) excluded`);

  const hardBlocked = fresh.length < limits.minIndependentSources
    || maxSpreadPercent === null
    || !Number.isFinite(maxSpreadPercent)
    || maxSpreadPercent > limits.maxSpreadPercent;

  if (hardBlocked) {
    return {
      state: "BLOCKED",
      allowNewRisk: false,
      independentSources: fresh.length,
      medianPrice: medianPrice === null ? null : Number(medianPrice.toFixed(8)),
      maxSpreadPercent: maxSpreadPercent === null || !Number.isFinite(maxSpreadPercent) ? null : Number(maxSpreadPercent.toFixed(4)),
      staleEvidence,
      invalidEvidence,
      reasons,
    };
  }

  const state: MarketDataQuorumState = fresh.length >= limits.preferredIndependentSources ? "GREEN" : "CAUTION";
  if (state === "CAUTION") {
    reasons.push(`minimum quorum met, but preferred redundancy is ${limits.preferredIndependentSources} independent sources`);
  }

  return {
    state,
    allowNewRisk: true,
    independentSources: fresh.length,
    medianPrice: Number(medianPrice!.toFixed(8)),
    maxSpreadPercent: Number(maxSpreadPercent!.toFixed(4)),
    staleEvidence,
    invalidEvidence,
    reasons,
  };
}
