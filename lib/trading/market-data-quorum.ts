export type MarketDataEligibility = "VALIDATION_ONLY" | "PAPER" | "LIVE";

export type MarketDataEvidence = {
  source: string;
  sourceFamily?: string;
  eligibility?: MarketDataEligibility;
  price: number;
  observedAt: string;
};

export type MarketDataQuorumLimits = {
  minIndependentSources: number;
  preferredIndependentSources: number;
  maxQuoteAgeSeconds: number;
  maxSpreadPercent: number;
  requiredEligibility?: "PAPER" | "LIVE";
};

export type MarketDataQuorumState = "GREEN" | "CAUTION" | "BLOCKED";

export type MarketDataQuorumDecision = {
  state: MarketDataQuorumState;
  allowNewRisk: boolean;
  independentSources: number;
  sourceFamilies: string[];
  requiredEligibility: "PAPER" | "LIVE";
  medianPrice: number | null;
  maxSpreadPercent: number | null;
  staleEvidence: number;
  ineligibleEvidence: number;
  invalidEvidence: number;
  reasons: string[];
};

export const DEFAULT_MARKET_DATA_QUORUM_LIMITS: MarketDataQuorumLimits = {
  minIndependentSources: 2,
  preferredIndependentSources: 3,
  maxQuoteAgeSeconds: 120,
  maxSpreadPercent: 0.75,
  requiredEligibility: "PAPER",
};

const ELIGIBILITY_RANK: Readonly<Record<MarketDataEligibility, number>> = {
  VALIDATION_ONLY: 0,
  PAPER: 1,
  LIVE: 2,
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

function normalizeFamily(item: MarketDataEvidence): string {
  const explicit = String(item?.sourceFamily || "").trim().toLowerCase();
  if (explicit) return explicit.replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "");
  return String(item?.source || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeEligibility(value: unknown): MarketDataEligibility {
  return value === "LIVE" || value === "PAPER" || value === "VALIDATION_ONLY"
    ? value
    : "VALIDATION_ONLY";
}

export function evaluateMarketDataQuorum(
  evidence: readonly MarketDataEvidence[],
  limits: MarketDataQuorumLimits = DEFAULT_MARKET_DATA_QUORUM_LIMITS,
  now = Date.now(),
): MarketDataQuorumDecision {
  const reasons: string[] = [];
  const freshestByFamily = new Map<string, { source: string; sourceFamily: string; eligibility: MarketDataEligibility; price: number; observedAtMs: number }>();
  let invalidEvidence = 0;
  let ineligibleEvidence = 0;
  const requiredEligibility = limits.requiredEligibility === "LIVE" ? "LIVE" : "PAPER";
  const minimumEligibilityRank = ELIGIBILITY_RANK[requiredEligibility];

  for (const item of evidence) {
    const source = String(item?.source || "").trim();
    const sourceFamily = normalizeFamily(item);
    const observedAtMs = Date.parse(String(item?.observedAt || ""));
    const price = Number(item?.price);
    const eligibility = normalizeEligibility(item?.eligibility);
    if (!source || !sourceFamily || !finitePositive(price) || !Number.isFinite(observedAtMs)) {
      invalidEvidence += 1;
      continue;
    }
    if (ELIGIBILITY_RANK[eligibility] < minimumEligibilityRank) {
      ineligibleEvidence += 1;
      continue;
    }
    const previous = freshestByFamily.get(sourceFamily);
    if (!previous
      || ELIGIBILITY_RANK[eligibility] > ELIGIBILITY_RANK[previous.eligibility]
      || (ELIGIBILITY_RANK[eligibility] === ELIGIBILITY_RANK[previous.eligibility] && observedAtMs > previous.observedAtMs)) {
      freshestByFamily.set(sourceFamily, { source, sourceFamily, eligibility, price, observedAtMs });
    }
  }

  const uniqueEvidence = [...freshestByFamily.values()];
  const fresh = uniqueEvidence.filter((item) => {
    const ageSeconds = (Number(now) - item.observedAtMs) / 1000;
    return Number.isFinite(ageSeconds) && ageSeconds >= 0 && ageSeconds <= limits.maxQuoteAgeSeconds;
  });
  const staleEvidence = uniqueEvidence.length - fresh.length;

  if (fresh.length < limits.minIndependentSources) {
    reasons.push(`insufficient independent fresh ${requiredEligibility.toLowerCase()}-eligible market-data families: ${fresh.length}/${limits.minIndependentSources}`);
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

  if (staleEvidence > 0) reasons.push(`${staleEvidence} eligible source family/families excluded as stale`);
  if (ineligibleEvidence > 0) reasons.push(`${ineligibleEvidence} evidence item(s) excluded because they are not ${requiredEligibility.toLowerCase()}-eligible`);
  if (invalidEvidence > 0) reasons.push(`${invalidEvidence} invalid evidence item(s) excluded`);

  const hardBlocked = fresh.length < limits.minIndependentSources
    || maxSpreadPercent === null
    || !Number.isFinite(maxSpreadPercent)
    || maxSpreadPercent > limits.maxSpreadPercent;

  const decisionBase = {
    independentSources: fresh.length,
    sourceFamilies: fresh.map((item) => item.sourceFamily).sort(),
    requiredEligibility,
    medianPrice: medianPrice === null ? null : Number(medianPrice.toFixed(8)),
    maxSpreadPercent: maxSpreadPercent === null || !Number.isFinite(maxSpreadPercent) ? null : Number(maxSpreadPercent.toFixed(4)),
    staleEvidence,
    ineligibleEvidence,
    invalidEvidence,
    reasons,
  };

  if (hardBlocked) {
    return {
      state: "BLOCKED",
      allowNewRisk: false,
      ...decisionBase,
    };
  }

  const state: MarketDataQuorumState = fresh.length >= limits.preferredIndependentSources ? "GREEN" : "CAUTION";
  if (state === "CAUTION") {
    reasons.push(`minimum quorum met, but preferred redundancy is ${limits.preferredIndependentSources} independent eligible source families`);
  }

  return {
    state,
    allowNewRisk: true,
    ...decisionBase,
  };
}
