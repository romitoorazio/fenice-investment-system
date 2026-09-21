export type DrawdownState = "NORMAL" | "CAUTION" | "DEFENSIVE" | "FREEZE";

export type DrawdownLimits = {
  dailyCautionPercent: number;
  dailyFreezePercent: number;
  weeklyCautionPercent: number;
  weeklyFreezePercent: number;
  portfolioCautionPercent: number;
  portfolioDefensivePercent: number;
  portfolioFreezePercent: number;
};

export type DrawdownInput = {
  currentEquityEuro: number;
  dayStartEquityEuro: number;
  weekStartEquityEuro: number;
  highWaterMarkEuro: number;
};

export type DrawdownDecision = {
  state: DrawdownState;
  allowNewRisk: boolean;
  riskMultiplier: number;
  killSwitchRequired: boolean;
  dailyLossPercent: number;
  weeklyLossPercent: number;
  portfolioDrawdownPercent: number;
  reasons: string[];
};

export const DEFAULT_DRAWDOWN_LIMITS: DrawdownLimits = {
  dailyCautionPercent: 2,
  dailyFreezePercent: 4,
  weeklyCautionPercent: 4,
  weeklyFreezePercent: 8,
  portfolioCautionPercent: 6,
  portfolioDefensivePercent: 10,
  portfolioFreezePercent: 15,
};

const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;

function lossPercent(reference: number, current: number): number {
  if (!positive(reference) || !Number.isFinite(current)) return Number.POSITIVE_INFINITY;
  return Math.max(0, ((reference - current) / reference) * 100);
}

export function evaluateDrawdown(
  input: DrawdownInput,
  limits: DrawdownLimits = DEFAULT_DRAWDOWN_LIMITS,
): DrawdownDecision {
  const reasons: string[] = [];
  const current = Number(input.currentEquityEuro);
  const dayStart = Number(input.dayStartEquityEuro);
  const weekStart = Number(input.weekStartEquityEuro);
  const highWaterMark = Number(input.highWaterMarkEuro);

  if (![current, dayStart, weekStart, highWaterMark].every(positive)) {
    return {
      state: "FREEZE",
      allowNewRisk: false,
      riskMultiplier: 0,
      killSwitchRequired: true,
      dailyLossPercent: 999,
      weeklyLossPercent: 999,
      portfolioDrawdownPercent: 999,
      reasons: ["invalid or missing equity reference; fail-closed"],
    };
  }

  const dailyLossPercent = lossPercent(dayStart, current);
  const weeklyLossPercent = lossPercent(weekStart, current);
  const portfolioDrawdownPercent = lossPercent(highWaterMark, current);

  const freeze = dailyLossPercent >= limits.dailyFreezePercent
    || weeklyLossPercent >= limits.weeklyFreezePercent
    || portfolioDrawdownPercent >= limits.portfolioFreezePercent;
  const defensive = portfolioDrawdownPercent >= limits.portfolioDefensivePercent;
  const caution = dailyLossPercent >= limits.dailyCautionPercent
    || weeklyLossPercent >= limits.weeklyCautionPercent
    || portfolioDrawdownPercent >= limits.portfolioCautionPercent;

  let state: DrawdownState = "NORMAL";
  if (freeze) state = "FREEZE";
  else if (defensive) state = "DEFENSIVE";
  else if (caution) state = "CAUTION";

  if (dailyLossPercent >= limits.dailyCautionPercent) reasons.push(`daily loss ${dailyLossPercent.toFixed(2)}%`);
  if (weeklyLossPercent >= limits.weeklyCautionPercent) reasons.push(`weekly loss ${weeklyLossPercent.toFixed(2)}%`);
  if (portfolioDrawdownPercent >= limits.portfolioCautionPercent) reasons.push(`portfolio drawdown ${portfolioDrawdownPercent.toFixed(2)}%`);

  const riskMultiplier = state === "NORMAL" ? 1 : state === "CAUTION" ? 0.75 : state === "DEFENSIVE" ? 0.5 : 0;

  return {
    state,
    allowNewRisk: state !== "FREEZE",
    riskMultiplier,
    killSwitchRequired: state === "FREEZE",
    dailyLossPercent: Number(dailyLossPercent.toFixed(3)),
    weeklyLossPercent: Number(weeklyLossPercent.toFixed(3)),
    portfolioDrawdownPercent: Number(portfolioDrawdownPercent.toFixed(3)),
    reasons,
  };
}
