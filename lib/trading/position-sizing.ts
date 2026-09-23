export type PositionSizingInput = {
  capitalEuro: number;
  riskPerTradePercent: number;
  entryPrice: number;
  stopPrice: number;
  fxToEuro: number;
  maxPositionPercent?: number;
  maxOrderNotionalPercent?: number;
  lotSize?: number;
};

export type PositionSizingDecision = {
  allowed: boolean;
  quantity: number;
  riskBudgetEuro: number;
  stopLossPerUnitEuro: number;
  stopDistancePercent: number;
  notionalEuro: number;
  riskAtStopEuro: number;
  limitingFactor: "RISK" | "NOTIONAL" | "INVALID";
  reasons: string[];
};

const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;

function roundDownToLot(value: number, lotSize: number): number {
  if (!Number.isFinite(value) || value <= 0 || !positive(lotSize)) return 0;
  const lots = Math.floor((value + 1e-12) / lotSize);
  return Number((lots * lotSize).toFixed(8));
}

export function calculatePositionSize(input: PositionSizingInput): PositionSizingDecision {
  const reasons: string[] = [];
  const capitalEuro = Number(input.capitalEuro);
  const riskPercent = Number(input.riskPerTradePercent);
  const entryPrice = Number(input.entryPrice);
  const stopPrice = Number(input.stopPrice);
  const fxToEuro = Number(input.fxToEuro);
  const maxPositionPercent = Number(input.maxPositionPercent ?? 10);
  const maxOrderNotionalPercent = Number(input.maxOrderNotionalPercent ?? 5);
  const lotSize = Number(input.lotSize ?? 1);

  if (!positive(capitalEuro)) reasons.push("capital must be positive");
  if (!positive(riskPercent) || riskPercent > 5) reasons.push("risk per trade must be > 0 and <= 5%");
  if (!positive(entryPrice) || !positive(stopPrice)) reasons.push("entry and stop prices must be positive");
  if (positive(entryPrice) && positive(stopPrice) && stopPrice >= entryPrice) reasons.push("long-only pilot requires stop below entry price");
  if (!positive(fxToEuro)) reasons.push("FX conversion to EUR must be positive");
  if (!positive(maxPositionPercent) || maxPositionPercent > 100) reasons.push("max position percent must be in (0,100]");
  if (!positive(maxOrderNotionalPercent) || maxOrderNotionalPercent > 100) reasons.push("max order notional percent must be in (0,100]");
  if (!positive(lotSize)) reasons.push("lot size must be positive");

  if (reasons.length) {
    return {
      allowed: false,
      quantity: 0,
      riskBudgetEuro: 0,
      stopLossPerUnitEuro: 0,
      stopDistancePercent: 0,
      notionalEuro: 0,
      riskAtStopEuro: 0,
      limitingFactor: "INVALID",
      reasons,
    };
  }

  const riskBudgetEuro = capitalEuro * riskPercent / 100;
  const stopLossPerUnitEuro = (entryPrice - stopPrice) * fxToEuro;
  const stopDistancePercent = ((entryPrice - stopPrice) / entryPrice) * 100;
  const quantityByRisk = riskBudgetEuro / stopLossPerUnitEuro;

  const maxNotionalEuro = capitalEuro * Math.min(maxPositionPercent, maxOrderNotionalPercent) / 100;
  const quantityByNotional = maxNotionalEuro / (entryPrice * fxToEuro);
  const rawQuantity = Math.min(quantityByRisk, quantityByNotional);
  const quantity = roundDownToLot(rawQuantity, lotSize);

  if (!positive(quantity)) {
    reasons.push("configured risk/notional limits produce zero tradable quantity");
  }

  const notionalEuro = quantity * entryPrice * fxToEuro;
  const riskAtStopEuro = quantity * stopLossPerUnitEuro;
  const limitingFactor = quantityByRisk <= quantityByNotional ? "RISK" : "NOTIONAL";

  return {
    allowed: reasons.length === 0,
    quantity,
    riskBudgetEuro: Number(riskBudgetEuro.toFixed(2)),
    stopLossPerUnitEuro: Number(stopLossPerUnitEuro.toFixed(4)),
    stopDistancePercent: Number(stopDistancePercent.toFixed(3)),
    notionalEuro: Number(notionalEuro.toFixed(2)),
    riskAtStopEuro: Number(riskAtStopEuro.toFixed(2)),
    limitingFactor,
    reasons,
  };
}
