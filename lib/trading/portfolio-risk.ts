export type PortfolioPositionRiskInput = {
  symbol: string;
  notionalEuro: number;
  sector?: string;
  assetClass?: string;
  returns?: number[];
};

export type PortfolioRiskLimits = {
  maxGrossExposurePercent: number;
  maxSinglePositionPercent: number;
  maxSectorPercent: number;
  maxAssetClassPercent: number;
  maxCapitalHhi: number;
  maxWeightedAbsCorrelation: number;
  maxCorrelatedClusterPercent: number;
  correlationThreshold: number;
  minSharedReturnObservations: number;
};

export type PortfolioRiskDecision = {
  state: "NORMAL" | "CAUTION" | "DEFENSIVE" | "FREEZE";
  allowNewRisk: boolean;
  riskMultiplier: number;
  grossExposurePercent: number;
  largestPositionPercent: number;
  largestSectorPercent: number;
  largestAssetClassPercent: number;
  capitalHhi: number;
  weightedAbsCorrelation: number | null;
  correlationPairs: number;
  maxCorrelatedClusterPercent: number | null;
  reasons: string[];
};

export const DEFAULT_PORTFOLIO_RISK_LIMITS: PortfolioRiskLimits = {
  maxGrossExposurePercent: 80,
  maxSinglePositionPercent: 15,
  maxSectorPercent: 35,
  maxAssetClassPercent: 60,
  maxCapitalHhi: 0.12,
  maxWeightedAbsCorrelation: 0.8,
  maxCorrelatedClusterPercent: 45,
  correlationThreshold: 0.75,
  minSharedReturnObservations: 20,
};

const finiteNonNegative = (value: unknown) => Number.isFinite(Number(value)) && Number(value) >= 0;

function pearson(a: readonly number[], b: readonly number[], minShared: number): number | null {
  const pairs: Array<[number, number]> = [];
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = Number(a[i]);
    const y = Number(b[i]);
    if (Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y]);
  }
  if (pairs.length < minShared) return null;
  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length;
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanX;
    const dy = y - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (varianceX <= 0 || varianceY <= 0) return null;
  return Math.max(-1, Math.min(1, covariance / Math.sqrt(varianceX * varianceY)));
}

function groupExposurePercent(
  positions: readonly PortfolioPositionRiskInput[],
  capitalEuro: number,
  selector: (position: PortfolioPositionRiskInput) => string,
): number {
  const grouped = new Map<string, number>();
  for (const position of positions) {
    const key = selector(position).trim().toUpperCase() || "UNKNOWN";
    grouped.set(key, (grouped.get(key) || 0) + Math.abs(Number(position.notionalEuro) || 0));
  }
  const largest = Math.max(0, ...grouped.values());
  return capitalEuro > 0 ? (largest / capitalEuro) * 100 : Number.POSITIVE_INFINITY;
}

export function evaluatePortfolioRisk(
  capitalEuro: number,
  rawPositions: readonly PortfolioPositionRiskInput[],
  limits: PortfolioRiskLimits = DEFAULT_PORTFOLIO_RISK_LIMITS,
): PortfolioRiskDecision {
  const reasons: string[] = [];
  const capital = Number(capitalEuro);
  if (!Number.isFinite(capital) || capital <= 0) {
    return {
      state: "FREEZE", allowNewRisk: false, riskMultiplier: 0,
      grossExposurePercent: 999, largestPositionPercent: 999, largestSectorPercent: 999,
      largestAssetClassPercent: 999, capitalHhi: 999, weightedAbsCorrelation: null,
      correlationPairs: 0, maxCorrelatedClusterPercent: null,
      reasons: ["invalid portfolio capital; fail-closed"],
    };
  }

  const positions = rawPositions
    .filter((position) => position?.symbol && finiteNonNegative(position.notionalEuro) && Number(position.notionalEuro) > 0)
    .map((position) => ({ ...position, symbol: String(position.symbol).toUpperCase(), notionalEuro: Math.abs(Number(position.notionalEuro)) }));

  const grossEuro = positions.reduce((sum, position) => sum + position.notionalEuro, 0);
  const grossExposurePercent = (grossEuro / capital) * 100;
  const positionPercents = positions.map((position) => (position.notionalEuro / capital) * 100);
  const largestPositionPercent = Math.max(0, ...positionPercents);
  const largestSectorPercent = groupExposurePercent(positions, capital, (position) => String(position.sector || "UNKNOWN"));
  const largestAssetClassPercent = groupExposurePercent(positions, capital, (position) => String(position.assetClass || "UNKNOWN"));
  const capitalHhi = positions.reduce((sum, position) => {
    const weight = position.notionalEuro / capital;
    return sum + weight * weight;
  }, 0);

  const pairCorrelations: Array<{ i: number; j: number; correlation: number; weight: number }> = [];
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      const left = positions[i].returns;
      const right = positions[j].returns;
      if (!Array.isArray(left) || !Array.isArray(right)) continue;
      const correlation = pearson(left, right, limits.minSharedReturnObservations);
      if (correlation === null) continue;
      const weight = (positions[i].notionalEuro / capital) * (positions[j].notionalEuro / capital);
      pairCorrelations.push({ i, j, correlation, weight });
    }
  }

  const correlationWeight = pairCorrelations.reduce((sum, pair) => sum + pair.weight, 0);
  const weightedAbsCorrelation = correlationWeight > 0
    ? pairCorrelations.reduce((sum, pair) => sum + Math.abs(pair.correlation) * pair.weight, 0) / correlationWeight
    : null;

  let maxCorrelatedClusterPercent: number | null = null;
  if (pairCorrelations.length > 0) {
    const adjacency = new Map<number, Set<number>>();
    for (let i = 0; i < positions.length; i += 1) adjacency.set(i, new Set());
    for (const pair of pairCorrelations) {
      if (Math.abs(pair.correlation) < limits.correlationThreshold) continue;
      adjacency.get(pair.i)?.add(pair.j);
      adjacency.get(pair.j)?.add(pair.i);
    }
    const visited = new Set<number>();
    let maxClusterEuro = 0;
    for (let start = 0; start < positions.length; start += 1) {
      if (visited.has(start)) continue;
      const stack = [start];
      let clusterEuro = 0;
      while (stack.length) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        clusterEuro += positions[current].notionalEuro;
        for (const next of adjacency.get(current) || []) if (!visited.has(next)) stack.push(next);
      }
      maxClusterEuro = Math.max(maxClusterEuro, clusterEuro);
    }
    maxCorrelatedClusterPercent = (maxClusterEuro / capital) * 100;
  }

  const hardBreaches = [
    grossExposurePercent > limits.maxGrossExposurePercent && `gross exposure ${grossExposurePercent.toFixed(2)}% > ${limits.maxGrossExposurePercent}%`,
    largestPositionPercent > limits.maxSinglePositionPercent && `single position ${largestPositionPercent.toFixed(2)}% > ${limits.maxSinglePositionPercent}%`,
    largestSectorPercent > limits.maxSectorPercent && `sector exposure ${largestSectorPercent.toFixed(2)}% > ${limits.maxSectorPercent}%`,
    largestAssetClassPercent > limits.maxAssetClassPercent && `asset-class exposure ${largestAssetClassPercent.toFixed(2)}% > ${limits.maxAssetClassPercent}%`,
    capitalHhi > limits.maxCapitalHhi && `capital concentration HHI ${capitalHhi.toFixed(4)} > ${limits.maxCapitalHhi}`,
    weightedAbsCorrelation !== null && weightedAbsCorrelation > limits.maxWeightedAbsCorrelation && `weighted absolute correlation ${weightedAbsCorrelation.toFixed(3)} > ${limits.maxWeightedAbsCorrelation}`,
    maxCorrelatedClusterPercent !== null && maxCorrelatedClusterPercent > limits.maxCorrelatedClusterPercent && `correlated cluster ${maxCorrelatedClusterPercent.toFixed(2)}% > ${limits.maxCorrelatedClusterPercent}%`,
  ].filter(Boolean) as string[];

  if (hardBreaches.length > 0) {
    return {
      state: "FREEZE", allowNewRisk: false, riskMultiplier: 0,
      grossExposurePercent: Number(grossExposurePercent.toFixed(2)),
      largestPositionPercent: Number(largestPositionPercent.toFixed(2)),
      largestSectorPercent: Number(largestSectorPercent.toFixed(2)),
      largestAssetClassPercent: Number(largestAssetClassPercent.toFixed(2)),
      capitalHhi: Number(capitalHhi.toFixed(4)),
      weightedAbsCorrelation: weightedAbsCorrelation === null ? null : Number(weightedAbsCorrelation.toFixed(4)),
      correlationPairs: pairCorrelations.length,
      maxCorrelatedClusterPercent: maxCorrelatedClusterPercent === null ? null : Number(maxCorrelatedClusterPercent.toFixed(2)),
      reasons: hardBreaches,
    };
  }

  const defensive = grossExposurePercent >= limits.maxGrossExposurePercent * 0.85
    || largestPositionPercent >= limits.maxSinglePositionPercent * 0.85
    || largestSectorPercent >= limits.maxSectorPercent * 0.85
    || largestAssetClassPercent >= limits.maxAssetClassPercent * 0.85
    || capitalHhi >= limits.maxCapitalHhi * 0.85
    || (weightedAbsCorrelation !== null && weightedAbsCorrelation >= limits.maxWeightedAbsCorrelation * 0.85)
    || (maxCorrelatedClusterPercent !== null && maxCorrelatedClusterPercent >= limits.maxCorrelatedClusterPercent * 0.85);
  if (defensive) reasons.push("portfolio is near a hard concentration/correlation limit");

  const missingCorrelationEvidence = grossExposurePercent >= 20 && positions.length >= 2 && pairCorrelations.length === 0;
  if (missingCorrelationEvidence) reasons.push("correlation evidence unavailable for a materially invested portfolio");

  const caution = grossExposurePercent >= limits.maxGrossExposurePercent * 0.6
    || largestPositionPercent >= limits.maxSinglePositionPercent * 0.6
    || largestSectorPercent >= limits.maxSectorPercent * 0.6
    || largestAssetClassPercent >= limits.maxAssetClassPercent * 0.6
    || capitalHhi >= limits.maxCapitalHhi * 0.6
    || missingCorrelationEvidence;

  const state = defensive ? "DEFENSIVE" : caution ? "CAUTION" : "NORMAL";
  const riskMultiplier = state === "DEFENSIVE" ? 0.5 : state === "CAUTION" ? 0.75 : 1;

  return {
    state,
    allowNewRisk: true,
    riskMultiplier,
    grossExposurePercent: Number(grossExposurePercent.toFixed(2)),
    largestPositionPercent: Number(largestPositionPercent.toFixed(2)),
    largestSectorPercent: Number(largestSectorPercent.toFixed(2)),
    largestAssetClassPercent: Number(largestAssetClassPercent.toFixed(2)),
    capitalHhi: Number(capitalHhi.toFixed(4)),
    weightedAbsCorrelation: weightedAbsCorrelation === null ? null : Number(weightedAbsCorrelation.toFixed(4)),
    correlationPairs: pairCorrelations.length,
    maxCorrelatedClusterPercent: maxCorrelatedClusterPercent === null ? null : Number(maxCorrelatedClusterPercent.toFixed(2)),
    reasons,
  };
}
