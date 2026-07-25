export type TerminalDecision = "ACCUMULA" | "MANTIENI" | "ATTENDI" | "SPECULATIVA" | "EVITA";
export type TechnicalSignal = "FORTE" | "POSITIVO" | "NEUTRALE" | "DEBOLE" | "NEGATIVO";
export type ValuationStatus = "disponibile" | "non confrontabile" | "non applicabile" | "dati insufficienti";

export type StrategyBacktest = {
  id: "buy-hold" | "trend-50-200" | "tactical-20-50";
  label: string;
  totalReturnPercent: number;
  annualizedReturnPercent: number;
  benchmarkAnnualizedReturnPercent: number;
  excessAnnualizedReturnPercent: number;
  maxDrawdownPercent: number;
  volatilityPercent: number;
  sharpe: number;
  trades: number;
  winRatePercent: number;
  exposurePercent: number;
  transactionCostPercent: number;
  observations: number;
};

export type TechnicalAsset = {
  symbol: string;
  yahooSymbol: string;
  name: string;
  assetClass: string;
  market: string;
  currency: string;
  observedAt: string;
  source: string;
  status: "operativo" | "parziale" | "errore";
  price?: number;
  returns: {
    oneMonthPercent?: number;
    threeMonthPercent?: number;
    sixMonthPercent?: number;
    oneYearPercent?: number;
  };
  indicators: {
    sma20?: number;
    sma50?: number;
    sma200?: number;
    rsi14?: number;
    volatility20Percent?: number;
    atr14Percent?: number;
    distance52WeekHighPercent?: number;
    maxDrawdown1YPercent?: number;
  };
  scores: {
    trend: number;
    momentum: number;
    risk: number;
    technical: number;
    dataCompleteness: number;
  };
  signal: TechnicalSignal;
  reasons: string[];
  warnings: string[];
  strategies: StrategyBacktest[];
};

export type ValuationView = {
  status: ValuationStatus;
  method: string;
  currency?: string;
  currentPrice?: number;
  priceToEarnings?: number;
  targetPriceToEarnings: number;
  fairValueLow?: number;
  fairValueBase?: number;
  fairValueHigh?: number;
  upsideBasePercent?: number;
  score: number;
  confidence: number;
  rationale: string[];
  warnings: string[];
};

export type UnifiedAsset = {
  symbol: string;
  name: string;
  assetClass: string;
  businessStage?: "maturo" | "crescita" | "pre-commerciale";
  price?: number;
  currency?: string;
  fundamentalScore?: number;
  technicalScore: number;
  valuationScore?: number;
  riskScore: number;
  dataCompleteness: number;
  unifiedScore: number;
  confidence: number;
  decision: TerminalDecision;
  reason: string;
  targetWeightPercent: number;
  targetAmountEuro: number;
  valuation: ValuationView;
  technical: TechnicalAsset;
  warnings: string[];
};

export type PortfolioSlice = {
  id: "core" | "growth" | "speculative" | "reserve";
  label: string;
  targetPercent: number;
  targetAmountEuro: number;
  rationale: string;
};

export type TerminalReport = {
  version: number;
  generatedAt: string;
  mode: "live" | "partial" | "bootstrap";
  capitalEuro: number;
  source: {
    name: string;
    state: "operativo" | "parziale" | "errore";
    detail: string;
    lastSuccessAt?: string;
  };
  universeSize: number;
  assetCount: number;
  coveragePercent: number;
  averageUnifiedScore: number;
  dataQuality: number;
  marketRegime: string;
  methodology: string[];
  portfolio: PortfolioSlice[];
  assets: UnifiedAsset[];
  warnings: string[];
};
