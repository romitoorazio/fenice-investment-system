export type CurrencyExposure = {
  currency: string;
  notionalLocal: number;
  fxToEuro?: number | null;
};

export type FxExposureLimits = {
  maxSingleForeignCurrencyPercent: number;
  maxTotalForeignCurrencyPercent: number;
};

export type FxExposureDecision = {
  allowed: boolean;
  reasons: string[];
  totalForeignExposureEuro: number;
  totalForeignExposurePercent: number;
  byCurrency: Array<{ currency: string; exposureEuro: number; portfolioPercent: number }>;
};

export const DEFAULT_FX_EXPOSURE_LIMITS: FxExposureLimits = {
  maxSingleForeignCurrencyPercent: 30,
  maxTotalForeignCurrencyPercent: 50,
};

export function evaluateFxExposure(
  portfolioEquityEuro: number,
  exposures: CurrencyExposure[],
  limits: FxExposureLimits = DEFAULT_FX_EXPOSURE_LIMITS,
): FxExposureDecision {
  const reasons: string[] = [];
  const equity = Number(portfolioEquityEuro);
  if (!Number.isFinite(equity) || equity <= 0) {
    return {
      allowed: false,
      reasons: ["portfolio equity is invalid"],
      totalForeignExposureEuro: 0,
      totalForeignExposurePercent: 0,
      byCurrency: [],
    };
  }

  const totals = new Map<string, number>();
  for (const item of exposures) {
    const currency = String(item.currency || "").trim().toUpperCase();
    const local = Math.abs(Number(item.notionalLocal));
    if (!currency || !Number.isFinite(local)) {
      reasons.push("invalid currency exposure record");
      continue;
    }
    if (currency === "EUR") continue;
    const fx = Number(item.fxToEuro);
    if (!Number.isFinite(fx) || fx <= 0) {
      reasons.push(`missing certified FX rate for ${currency}`);
      continue;
    }
    totals.set(currency, (totals.get(currency) ?? 0) + local * fx);
  }

  const byCurrency = [...totals.entries()]
    .map(([currency, exposureEuro]) => ({
      currency,
      exposureEuro: Number(exposureEuro.toFixed(2)),
      portfolioPercent: Number(((exposureEuro / equity) * 100).toFixed(3)),
    }))
    .sort((a, b) => b.exposureEuro - a.exposureEuro);

  for (const item of byCurrency) {
    if (item.portfolioPercent > limits.maxSingleForeignCurrencyPercent) {
      reasons.push(`${item.currency} exposure exceeds single-currency limit`);
    }
  }

  const totalForeignExposureEuro = byCurrency.reduce((sum, item) => sum + item.exposureEuro, 0);
  const totalForeignExposurePercent = Number(((totalForeignExposureEuro / equity) * 100).toFixed(3));
  if (totalForeignExposurePercent > limits.maxTotalForeignCurrencyPercent) {
    reasons.push("total foreign-currency exposure exceeds portfolio limit");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    totalForeignExposureEuro: Number(totalForeignExposureEuro.toFixed(2)),
    totalForeignExposurePercent,
    byCurrency,
  };
}
