export type CapitalGoalInput = {
  initialCapital: number;
  targetCapital: number;
  horizonYears: number;
  annualContribution?: number;
};

export type CapitalScenario = {
  id: "prudente" | "bilanciato" | "aggressivo" | "obiettivo";
  label: string;
  annualReturnPercent: number;
  projectedCapital: number;
  targetProgressPercent: number;
  targetReached: boolean;
  riskLevel: "basso" | "medio" | "alto" | "molto alto";
};

export type CapitalGoalPlan = {
  input: Required<CapitalGoalInput>;
  requiredAnnualReturnPercent: number;
  requiredMonthlyReturnPercent: number;
  capitalMultiple: number;
  scenarios: CapitalScenario[];
  guardrails: {
    maximumSinglePositionPercent: number;
    maximumSpeculativePercent: number;
    minimumCashReservePercent: number;
    maximumCryptoPercent: number;
    maximumPortfolioDrawdownPercent: number;
  };
  verdict: "matematicamente possibile" | "obiettivo estremamente ambizioso" | "input non valido";
  warnings: string[];
};

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function futureValue(initial: number, annualContribution: number, annualRate: number, years: number) {
  let capital = initial;
  for (let year = 0; year < years; year += 1) {
    capital = capital * (1 + annualRate) + annualContribution;
  }
  return capital;
}

function solveRequiredRate(initial: number, target: number, annualContribution: number, years: number) {
  if (annualContribution === 0) return Math.pow(target / initial, 1 / years) - 1;

  let low = -0.99;
  let high = 3;
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const mid = (low + high) / 2;
    const value = futureValue(initial, annualContribution, mid, years);
    if (value >= target) high = mid;
    else low = mid;
  }
  return high;
}

export function buildCapitalGoalPlan(input: CapitalGoalInput): CapitalGoalPlan {
  const annualContribution = Number.isFinite(input.annualContribution) ? Math.max(0, Number(input.annualContribution)) : 0;
  const normalized = {
    initialCapital: Number(input.initialCapital),
    targetCapital: Number(input.targetCapital),
    horizonYears: Math.round(Number(input.horizonYears)),
    annualContribution,
  };

  if (
    !finitePositive(normalized.initialCapital) ||
    !finitePositive(normalized.targetCapital) ||
    !finitePositive(normalized.horizonYears) ||
    normalized.targetCapital <= normalized.initialCapital
  ) {
    return {
      input: normalized,
      requiredAnnualReturnPercent: 0,
      requiredMonthlyReturnPercent: 0,
      capitalMultiple: 0,
      scenarios: [],
      guardrails: {
        maximumSinglePositionPercent: 12,
        maximumSpeculativePercent: 5,
        minimumCashReservePercent: 15,
        maximumCryptoPercent: 5,
        maximumPortfolioDrawdownPercent: 20,
      },
      verdict: "input non valido",
      warnings: ["Capitale iniziale, obiettivo e orizzonte devono essere positivi; l'obiettivo deve superare il capitale iniziale."],
    };
  }

  const requiredRate = solveRequiredRate(
    normalized.initialCapital,
    normalized.targetCapital,
    normalized.annualContribution,
    normalized.horizonYears,
  );
  const requiredMonthlyRate = Math.pow(1 + requiredRate, 1 / 12) - 1;

  const definitions: Array<Omit<CapitalScenario, "projectedCapital" | "targetProgressPercent" | "targetReached">> = [
    { id: "prudente", label: "Scenario prudente", annualReturnPercent: 5, riskLevel: "basso" },
    { id: "bilanciato", label: "Scenario bilanciato", annualReturnPercent: 9, riskLevel: "medio" },
    { id: "aggressivo", label: "Scenario aggressivo", annualReturnPercent: 15, riskLevel: "alto" },
    {
      id: "obiettivo",
      label: "Rendimento necessario per l'obiettivo",
      annualReturnPercent: requiredRate * 100,
      riskLevel: requiredRate >= 0.2 ? "molto alto" : requiredRate >= 0.12 ? "alto" : "medio",
    },
  ];

  const scenarios = definitions.map((scenario) => {
    const projectedCapital = futureValue(
      normalized.initialCapital,
      normalized.annualContribution,
      scenario.annualReturnPercent / 100,
      normalized.horizonYears,
    );
    return {
      ...scenario,
      projectedCapital: Math.round(projectedCapital * 100) / 100,
      targetProgressPercent: Math.round(clamp((projectedCapital / normalized.targetCapital) * 100) * 10) / 10,
      targetReached: projectedCapital >= normalized.targetCapital,
    } satisfies CapitalScenario;
  });

  const warnings = [
    ...(requiredRate >= 0.2
      ? ["Il rendimento composto richiesto supera il 20% annuo: l'obiettivo comporta rischio molto elevato e non è garantibile."]
      : []),
    ...(normalized.annualContribution === 0
      ? ["Senza nuovi versamenti, tutto il risultato dipende dal rendimento degli investimenti."]
      : []),
    "Fenice deve usare simulazioni, dati verificati e conferma umana: non deve inviare ordini automaticamente.",
  ];

  return {
    input: normalized,
    requiredAnnualReturnPercent: Math.round(requiredRate * 10_000) / 100,
    requiredMonthlyReturnPercent: Math.round(requiredMonthlyRate * 10_000) / 100,
    capitalMultiple: Math.round((normalized.targetCapital / normalized.initialCapital) * 100) / 100,
    scenarios,
    guardrails: {
      maximumSinglePositionPercent: 12,
      maximumSpeculativePercent: 5,
      minimumCashReservePercent: 15,
      maximumCryptoPercent: 5,
      maximumPortfolioDrawdownPercent: 20,
    },
    verdict: requiredRate >= 0.2 ? "obiettivo estremamente ambizioso" : "matematicamente possibile",
    warnings,
  };
}

export const DEFAULT_CAPITAL_GOAL = buildCapitalGoalPlan({
  initialCapital: 10_000,
  targetCapital: 100_000,
  horizonYears: 10,
  annualContribution: 0,
});
