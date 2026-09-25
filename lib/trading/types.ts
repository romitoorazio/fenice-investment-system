export type ExecutionMode = "PAPER" | "LIVE";
export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type TimeInForce = "DAY" | "GTC";

export type ProposedOrder = {
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  timeInForce: TimeInForce;
  quantity: number;
  referencePrice: number;
  limitPrice?: number;
  currency: string;
  mode: ExecutionMode;
  requestedAt: string;
  humanConfirmed: boolean;
  fxProvider?: string;
  fxObservedAt?: string;
};

export type RiskLimits = {
  maxOrderNotionalPercent: number;
  maxSingleAssetWeightPercent: number;
  maxGrossExposurePercent: number;
  maxDailyTurnoverPercent: number;
  maxOpenOrders: number;
  minDataConfidence: number;
  minIndependentSources: number;
  maxRiskScore: number;
  maxQuoteAgeSeconds: number;
};

export type RiskContext = {
  capitalEuro: number;
  fxToEuro: number;
  existingPositionNotionalEuro: number;
  currentGrossExposureEuro: number;
  dailyTurnoverEuro: number;
  openOrders: number;
  dataConfidence: number;
  independentSources: number;
  riskScore: number;
  quoteObservedAt: string;
  dataDivergent: boolean;
  sourceStale: boolean;
  killSwitchEngaged: boolean;
  brokerConnectivityAllowed: boolean;
  liveTradingReleased: boolean;
};

export type RiskCheck = {
  code: string;
  passed: boolean;
  message: string;
  observed?: number | string | boolean;
  limit?: number | string | boolean;
};

export type PreTradeDecision = {
  allowed: boolean;
  orderNotionalEuro: number;
  resultingPositionWeightPercent: number;
  resultingGrossExposurePercent: number;
  resultingDailyTurnoverPercent: number;
  checks: RiskCheck[];
  reasons: string[];
};

export type PaperExecution = {
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  status: "RISK_REJECTED" | "PAPER_FILLED";
  requestedQuantity: number;
  filledQuantity: number;
  referencePrice: number;
  fillPrice: number | null;
  notionalEuro: number;
  estimatedFeeEuro: number;
  estimatedSlippageEuro: number;
  currency: string;
  fxToEuro: number;
  fxProvider: string | null;
  fxObservedAt: string | null;
  createdAt: string;
  filledAt: string | null;
  risk: PreTradeDecision;
};

export type Position = {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currency: string;
};

export type ReconciliationBreak = {
  symbol: string;
  expectedQuantity: number;
  actualQuantity: number;
  difference: number;
};

export type ReconciliationReport = {
  balanced: boolean;
  breaks: ReconciliationBreak[];
};
