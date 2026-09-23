export type RiskOfRuinInput = {
  capitalEuro: number;
  riskPerTradePercent: number;
  validatedTrades: number;
  winRate: number;
  averageWinLossRatio: number;
  currentDrawdownPercent?: number;
  maxConsecutiveLosses?: number;
  maxProjectedDrawdownPercent?: number;
  minValidatedTrades?: number;
};

export type RiskOfRuinDecision = {
  state: "GREEN" | "CAUTION" | "BLOCKED";
  allowNewRisk: boolean;
  edgePerRiskUnit: number;
  kellyPercent: number;
  conservativeKellyCapPercent: number;
  allowedRiskPerTradePercent: number;
  projectedLossStreakDrawdownPercent: number;
  projectedTotalDrawdownPercent: number;
  reasons: string[];
};

const finite = (value: unknown) => Number.isFinite(Number(value));
const positive = (value: unknown) => finite(value) && Number(value) > 0;

export function evaluateRiskOfRuin(input: RiskOfRuinInput): RiskOfRuinDecision {
  const reasons: string[] = [];
  const capital = Number(input.capitalEuro);
  const riskPercent = Number(input.riskPerTradePercent);
  const validatedTrades = Number(input.validatedTrades);
  const winRate = Number(input.winRate);
  const payoff = Number(input.averageWinLossRatio);
  const currentDrawdown = Math.max(0, Number(input.currentDrawdownPercent ?? 0));
  const lossStreak = Math.max(1, Math.floor(Number(input.maxConsecutiveLosses ?? 8)));
  const maxProjectedDrawdown = Number(input.maxProjectedDrawdownPercent ?? 20);
  const minValidatedTrades = Math.max(1, Math.floor(Number(input.minValidatedTrades ?? 30)));

  if (!positive(capital)) reasons.push("capital must be positive");
  if (!positive(riskPercent) || riskPercent > 5) reasons.push("risk per trade must be > 0 and <= 5%");
  if (!Number.isInteger(validatedTrades) || validatedTrades < 0) reasons.push("validated trade count must be a non-negative integer");
  if (!finite(winRate) || winRate <= 0 || winRate >= 1) reasons.push("win rate must be between 0 and 1");
  if (!positive(payoff)) reasons.push("average win/loss ratio must be positive");
  if (!finite(currentDrawdown) || currentDrawdown < 0 || currentDrawdown >= 100) reasons.push("current drawdown must be in [0,100)");
  if (!positive(maxProjectedDrawdown) || maxProjectedDrawdown >= 100) reasons.push("max projected drawdown must be in (0,100)");

  if (reasons.length) {
    return {
      state: "BLOCKED",
      allowNewRisk: false,
      edgePerRiskUnit: 0,
      kellyPercent: 0,
      conservativeKellyCapPercent: 0,
      allowedRiskPerTradePercent: 0,
      projectedLossStreakDrawdownPercent: 100,
      projectedTotalDrawdownPercent: 100,
      reasons,
    };
  }

  const lossRate = 1 - winRate;
  const edge = winRate * payoff - lossRate;
  const kelly = Math.max(0, winRate - lossRate / payoff) * 100;
  const conservativeKellyCap = Math.min(1, kelly * 0.25);
  const allowedRiskPerTrade = Math.max(0, conservativeKellyCap);
  const perTradeFraction = riskPercent / 100;
  const streakDrawdown = (1 - (1 - perTradeFraction) ** lossStreak) * 100;
  const projectedTotalDrawdown = 100 - ((100 - currentDrawdown) * (100 - streakDrawdown)) / 100;

  if (validatedTrades < minValidatedTrades) {
    reasons.push(`insufficient validated trades: ${validatedTrades}/${minValidatedTrades}`);
  }
  if (edge <= 0) reasons.push("validated strategy edge is not positive");
  if (kelly <= 0) reasons.push("Kelly fraction is non-positive");
  if (riskPercent > allowedRiskPerTrade + 1e-9) {
    reasons.push(`risk per trade ${riskPercent.toFixed(3)}% exceeds conservative cap ${allowedRiskPerTrade.toFixed(3)}%`);
  }
  if (projectedTotalDrawdown > maxProjectedDrawdown + 1e-9) {
    reasons.push(`projected loss-streak drawdown ${projectedTotalDrawdown.toFixed(2)}% exceeds ${maxProjectedDrawdown}% limit`);
  }

  const blocked = validatedTrades < minValidatedTrades
    || edge <= 0
    || kelly <= 0
    || riskPercent > allowedRiskPerTrade + 1e-9
    || projectedTotalDrawdown > maxProjectedDrawdown + 1e-9;

  const caution = !blocked && (currentDrawdown >= maxProjectedDrawdown * 0.5 || riskPercent >= allowedRiskPerTrade * 0.8);

  return {
    state: blocked ? "BLOCKED" : caution ? "CAUTION" : "GREEN",
    allowNewRisk: !blocked,
    edgePerRiskUnit: Number(edge.toFixed(4)),
    kellyPercent: Number(kelly.toFixed(3)),
    conservativeKellyCapPercent: Number(conservativeKellyCap.toFixed(3)),
    allowedRiskPerTradePercent: Number(allowedRiskPerTrade.toFixed(3)),
    projectedLossStreakDrawdownPercent: Number(streakDrawdown.toFixed(3)),
    projectedTotalDrawdownPercent: Number(projectedTotalDrawdown.toFixed(3)),
    reasons,
  };
}
