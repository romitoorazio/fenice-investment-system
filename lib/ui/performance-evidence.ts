/**
 * Read-only performance evidence for the research dashboard.
 * NEVER infer NAV, realised P&L, net return or benchmark outperformance
 * from PAPER fills, cost estimates or V7 decision outcome counts.
 * This module does not modify PAPER V6 execution or certification.
 */
export type PaperExecution = {
  clientOrderId?: string;
  symbol?: string;
  status?: string;
  filledAt?: string;
  notionalEuro?: number;
  estimatedFeeEuro?: number;
  estimatedSlippageEuro?: number;
};

export type PaperOmsSnapshot = {
  mode?: string;
  generatedAt?: string;
  liveTradingAllowed?: boolean;
  brokerConnectivityAllowed?: boolean;
  executions?: PaperExecution[];
};

export type V7OutcomesSnapshot = {
  generatedAt?: string;
  ledgerRecordCount?: number;
  horizons?: Record<string, {
    sampleSize?: number;
    decisions?: { COMPRA?: { sampleSize?: number } };
    restraintTradeoff?: { biasState?: string };
  }>;
};

export type CalibrationSnapshot = {
  generatedAt?: string;
  horizons?: Record<string, { state?: string; sampleSize?: number }>;
};

function validTimestamp(iso: unknown, now: number) {
  // Only original, canonical UTC evidence can support financial reporting.
  // Date.parse alone normalizes impossible dates and accepts local-time strings.
  if (typeof iso !== "string" || !Number.isSafeInteger(now) || now < 0
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(iso)) return null;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > now) return null;
  const canonical = iso.includes(".") ? iso : iso.replace(/Z$/, ".000Z");
  return new Date(timestamp).toISOString() === canonical ? timestamp : null;
}
function finiteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function finitePositive(value: unknown): value is number {
  return finiteNonnegative(value) && value > 0;
}
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function summarizePerformanceEvidence(
  paper: PaperOmsSnapshot | null | undefined,
  v7: V7OutcomesSnapshot | null | undefined,
  calibration: CalibrationSnapshot | null | undefined,
  now: number,
) {
  const paperTimestamp = validTimestamp(paper?.generatedAt, now);
  const paperSafe = paper?.mode === "PAPER"
    && paper?.liveTradingAllowed === false
    && paper?.brokerConnectivityAllowed === false
    && paperTimestamp !== null;
  const executions = paperSafe && Array.isArray(paper?.executions) ? paper.executions : [];
  const filled = executions.filter(row => row.status === "PAPER_FILLED");
  const ids = new Set<string>();
  let completeCosts = paperSafe && filled.length > 0 && filled.every(row => {
    const id = String(row.clientOrderId ?? "").trim();
    if (!id || ids.has(id)) return false;
    ids.add(id);
    return Boolean(row.symbol?.trim())
      && validTimestamp(row.filledAt, paperTimestamp!) !== null
      && finitePositive(row.notionalEuro)
      && finiteNonnegative(row.estimatedFeeEuro)
      && finiteNonnegative(row.estimatedSlippageEuro);
  });
  const sumIfFinite = (field: "notionalEuro" | "estimatedFeeEuro" | "estimatedSlippageEuro") => {
    if (!completeCosts) return null;
    const value = filled.reduce((sum, row) => sum + row[field]!, 0);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  const notional = sumIfFinite("notionalEuro");
  const fees = sumIfFinite("estimatedFeeEuro");
  const slippage = sumIfFinite("estimatedSlippageEuro");
  const totalCosts = notional !== null && fees !== null && slippage !== null
    && Number.isFinite(fees + slippage) ? fees + slippage : null;
  completeCosts = completeCosts && notional !== null && fees !== null
    && slippage !== null && totalCosts !== null;
  const costImpactPercent = totalCosts !== null && notional !== null && notional > 0
    ? round(100 * totalCosts / notional) : null;

  const v7Timestamp = validTimestamp(v7?.generatedAt, now);
  const v7Usable = v7Timestamp !== null;
  const horizons = ["1d", "7d", "30d", "90d"].map(horizon => {
    const record = v7Usable ? v7?.horizons?.[horizon] : undefined;
    const sampleSize = count(record?.sampleSize);
    const buySamples = count(record?.decisions?.COMPRA?.sampleSize);
    return {
      horizon,
      totalDecisionObservations: sampleSize,
      buySamples: sampleSize !== null && buySamples !== null && buySamples <= sampleSize
        ? buySamples : null,
      restraintBias: typeof record?.restraintTradeoff?.biasState === "string"
        ? record.restraintTradeoff.biasState : "NON VERIFICATO",
    };
  });
  const buySampleCount = horizons.map(x => x.buySamples).filter((x): x is number => x !== null);
  // Counts demonstrate only that research decisions were observed; they
  // provide no price-series, independent benchmark, or realized net outcomes.
  const hasObservedBuySamples = buySampleCount.length === 4 && buySampleCount.some(n => n > 0);
  const hasValidatedBuyOutcomes = false;
  const calibrationTimestamp = validTimestamp(calibration?.generatedAt, now);
  const calibrationEvidence = ["7d", "30d", "90d"].map(horizon => {
    const entry = calibrationTimestamp !== null ? calibration?.horizons?.[horizon] : undefined;
    return {
      horizon,
      state: entry?.state === "MATURE" || entry?.state === "VERIFIED"
        ? entry.state : "INSUFFICIENT",
      sampleSize: count(entry?.sampleSize),
    };
  });
  return {
    paper: {
      snapshotAt: paperTimestamp !== null ? paper!.generatedAt! : null,
      safe: paperSafe,
      filledCount: paperSafe ? filled.length : null,
      estimatedNotionalEuro: notional !== null ? round(notional) : null,
      estimatedFeesEuro: fees !== null ? round(fees) : null,
      estimatedSlippageEuro: slippage !== null ? round(slippage) : null,
      estimatedCombinedCostsEuro: totalCosts !== null ? round(totalCosts) : null,
      estimatedCostToNotionalPercent: costImpactPercent,
      costsComplete: completeCosts,
    },
    v7: {
      snapshotAt: v7Usable ? v7!.generatedAt! : null,
      ledgerRecordCount: v7Usable ? count(v7?.ledgerRecordCount) : null,
      horizons,
      hasObservedBuySamples,
      hasValidatedBuyOutcomes,
    },
    calibration: {
      snapshotAt: calibrationTimestamp !== null ? calibration!.generatedAt! : null,
      horizons: calibrationEvidence,
    },
    // A mark-to-market NAV series, realised closed trades, capital flows,
    // spread/FX cost reconciliation and time-aligned benchmark are absent.
    netReturnPercent: null,
    euroNetPnl: null,
    benchmarkExcessReturnPercent: null,
    liveBrokerPerformanceVerified: false,
    profitableStrategyVerified: false,
  };
}
