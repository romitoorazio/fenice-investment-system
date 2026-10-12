export type BuyBarrierRow = {
  symbol?: string;
  decision?: string;
  committeeScore?: number | null;
  confidence?: number | null;
  riskScore?: number | null;
  scorecard?: { valuation?: number | null } | null;
  terminalDecision?: string | null;
  valuation?: { status?: string; upsideBasePercent?: number | null } | null;
};
export type BuyBarrierExplanation = {
  state: "UNAVAILABLE" | "RESEARCH_ONLY";
  symbol?: string;
  currentDecision?: string;
  reasons: string[];
  executionEligible: false;
  estimatedReturn?: null;
};
export function explainBuyConstraints(row: BuyBarrierRow | null | undefined, fresh: boolean): BuyBarrierExplanation;
