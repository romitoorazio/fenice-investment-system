export type AdversarialReviewInput = {
  thesisScore: number;
  valuationRisk: number;
  macroRisk: number;
  liquidityRisk: number;
  crowdingRisk: number;
  dataRisk: number;
  contradictionCount: number;
};

export type AdversarialReview = {
  verdict: "PASS" | "CHALLENGE" | "REJECT";
  adjustedScore: number;
  objections: string[];
};

/** Independent devil's-advocate review. It can only reduce conviction. */
export function runAdversarialReview(input: AdversarialReviewInput): AdversarialReview {
  const objections: string[] = [];
  const risks = [
    ["valuation", input.valuationRisk],
    ["macro", input.macroRisk],
    ["liquidity", input.liquidityRisk],
    ["crowding", input.crowdingRisk],
    ["data", input.dataRisk],
  ] as const;

  for (const [name, risk] of risks) if (risk >= 70) objections.push(`${name}-risk-high`);
  if (input.contradictionCount > 0) objections.push("material-contradictions-present");

  const riskPenalty = Math.max(...risks.map(([, risk]) => risk), 0) * 0.25;
  const contradictionPenalty = Math.min(input.contradictionCount * 7.5, 30);
  const adjustedScore = Math.max(0, Math.min(input.thesisScore, input.thesisScore - riskPenalty - contradictionPenalty));

  if (objections.length >= 2 || adjustedScore < 50) return { verdict: "REJECT", adjustedScore, objections };
  if (objections.length === 1 || adjustedScore < 70) return { verdict: "CHALLENGE", adjustedScore, objections };
  return { verdict: "PASS", adjustedScore, objections };
}
