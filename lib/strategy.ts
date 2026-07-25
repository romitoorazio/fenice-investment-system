export type StrategyVerdict = "ROBUSTA" | "PROMETTENTE" | "FRAGILE" | "INSUFFICIENTE";

export type StrategyMetrics = {
  annualizedReturnPercent: number;
  benchmarkAnnualizedReturnPercent: number;
  excessAnnualizedReturnPercent: number;
  maxDrawdownPercent: number;
  benchmarkMaxDrawdownPercent: number;
  volatilityPercent: number;
  sharpe: number;
  trades: number;
  exposurePercent: number;
  observations: number;
};

export type StrategyVariant = {
  id: string;
  label: string;
  parameters: Record<string, number>;
  inSample: StrategyMetrics;
  outOfSample: StrategyMetrics;
  fullPeriod: StrategyMetrics;
};

export type StrategyFamily = {
  id: "trend" | "tactical";
  label: string;
  verdict: StrategyVerdict;
  robustnessScore: number;
  positiveOutOfSampleVariants: number;
  variantCount: number;
  medianOutOfSampleExcessPercent: number;
  medianOutOfSampleDrawdownImprovementPercent: number;
  selectedVariantId: string;
  variants: StrategyVariant[];
  rationale: string[];
  warnings: string[];
};

export type StrategyAsset = {
  symbol: string;
  name: string;
  assetClass: string;
  source: string;
  observedAt: string;
  status: "operativo" | "parziale" | "errore";
  historyYears: number;
  observations: number;
  splitDate?: string;
  benchmark: string;
  families: StrategyFamily[];
  bestFamily?: "trend" | "tactical";
  bestRobustnessScore: number;
  conclusion: StrategyVerdict;
  warnings: string[];
};

export type StrategyLabReport = {
  version: number;
  generatedAt: string;
  mode: "live" | "partial" | "bootstrap";
  source: {
    name: string;
    state: "operativo" | "parziale" | "errore";
    detail: string;
  };
  universeSize: number;
  assetCount: number;
  coveragePercent: number;
  robustCount: number;
  methodology: string[];
  assets: StrategyAsset[];
  warnings: string[];
};
