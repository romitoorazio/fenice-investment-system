/**
 * FENICE100K - economic opportunity review, deliberately separate from orders.
 *
 * Makes the first investment research decision useful even when the committee
 * has zero BUY candidates. It never predicts returns, changes committee rules,
 * treats technical signals as orders or modifies frozen PAPER evidence.
 */
export type OpportunityCommitteeRow = {
  symbol?: string;
  name?: string;
  assetClass?: string;
  decision?: string;
  terminalDecision?: string;
  committeeScore?: number | null;
  confidence?: number | null;
  riskScore?: number | null;
  currentPrice?: number | null;
  currency?: string | null;
  scorecard?: { valuation?: number | null };
  valuation?: { status?: string | null; upsideBasePercent?: number | null };
  priceEvidence?: { observedAt?: string | null; executionEligible?: boolean };
  bullCase?: string[];
  bearCase?: string[];
  reviewTriggers?: string[];
};

export type OpportunityGap = {
  code: "SCORE" | "CONFIDENCE" | "RISK" | "VALUATION" | "ETF_VALUATION" |
    "TECHNICAL" | "DCF";
  description: string;
};

export type OpportunityResearchRow = {
  symbol: string;
  name: string;
  decision: string;
  technicalDecision: string;
  committeeScore: number;
  pointsBelowBuyScore: number;
  confidence: number | null;
  riskScore: number;
  scorecardValuation: number | null;
  referencePrice: number | null;
  currency: string | null;
  missingConditions: OpportunityGap[];
  bullCase: string | null;
  bearCase: string | null;
  reviewTrigger: string | null;
  valuationMethodGap: boolean;
  quoteVerifiedForExecution: false;
  brokerOrderAllowed: false;
  returnForecastPercent: null;
};

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const textValue = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
const textFirst = (value: unknown): string | null =>
  Array.isArray(value) ? (value.map(textValue).find(Boolean) || null) : null;

function buildGaps(row: OpportunityCommitteeRow): OpportunityGap[] {
  const gaps: OpportunityGap[] = [];
  const score = row.committeeScore;
  const risk = row.riskScore;
  const confidence = row.confidence;
  const value = row.scorecard?.valuation;
  if (finite(score) && score < 78)
    gaps.push({ code: "SCORE", description: `Punteggio ${score}/100: servono altri ${78 - score} punti per il requisito del Comitato.` });
  if (!finite(confidence) || confidence < 72)
    gaps.push({ code: "CONFIDENCE", description: finite(confidence) ? `Confidenza ${confidence}/100 sotto 72.` : "Confidenza non disponibile." });
  if (finite(risk) && risk > 58)
    gaps.push({ code: "RISK", description: `Rischio ${risk}/100 sopra il limite 58.` });
  const isEtfWithoutValuation = String(row.assetClass || "").toUpperCase() === "ETF"
    && String(row.valuation?.status || "").toLowerCase() === "non applicabile";
  if (isEtfWithoutValuation) {
    gaps.push({ code: "ETF_VALUATION", description: "ETF: valutazione neutra/non applicabile. Serve un criterio economico specifico per ETF; il punteggio 50 non è un valore fondamentale misurato." });
  } else if (!finite(value)) {
    gaps.push({ code: "VALUATION", description: "Manca una valutazione attendibile." });
  } else if (value < 55) {
    gaps.push({ code: "VALUATION", description: `Valutazione ${value}/100 sotto il requisito 55.` });
  }
  if (row.terminalDecision !== "ACCUMULA")
    gaps.push({ code: "TECHNICAL", description: "Il motore tecnico non dà ACCUMULA." });
  if (row.valuation?.status === "disponibile"
    && finite(row.valuation.upsideBasePercent) && row.valuation.upsideBasePercent < -25)
    gaps.push({ code: "DCF", description: "DCF segnala possibile sopravvalutazione rilevante; non usarlo come target di profitto." });
  return gaps;
}

export function buildOpportunityWatchlist(
  rows: readonly OpportunityCommitteeRow[] | null | undefined,
  committeeFresh: boolean,
  limit = 5,
): OpportunityResearchRow[] {
  if (!committeeFresh || !Array.isArray(rows) || !Number.isSafeInteger(limit) || limit < 1) return [];

  const results: OpportunityResearchRow[] = [];
  const symbols = new Set<string>();
  for (const row of rows) {
    const symbol = textValue(row?.symbol)?.toUpperCase();
    if (!symbol || symbols.has(symbol)) continue;
    symbols.add(symbol);
    // Absolute no-go / unsupported assessments must not become "opportunities".
    if (row.decision === "EVITA" || !finite(row.committeeScore)
      || !finite(row.riskScore) || row.riskScore >= 80) continue;

    const missingConditions = buildGaps(row);
    const referencePrice = finite(row.currentPrice) && row.currentPrice > 0
      ? row.currentPrice : null;
    results.push({
      symbol,
      name: textValue(row.name) || symbol,
      decision: textValue(row.decision) || "ATTENDI",
      technicalDecision: textValue(row.terminalDecision) || "NON VERIFICATO",
      committeeScore: row.committeeScore,
      pointsBelowBuyScore: Math.max(0, 78 - row.committeeScore),
      confidence: finite(row.confidence) ? row.confidence : null,
      riskScore: row.riskScore,
      scorecardValuation: finite(row.scorecard?.valuation) ? row.scorecard?.valuation ?? null : null,
      referencePrice,
      currency: textValue(row.currency),
      missingConditions,
      bullCase: textFirst(row.bullCase),
      bearCase: textFirst(row.bearCase),
      reviewTrigger: textFirst(row.reviewTriggers),
      valuationMethodGap: missingConditions.some(gap => gap.code === "ETF_VALUATION"),
      // A static report price never becomes a verified executable quote.
      quoteVerifiedForExecution: false,
      brokerOrderAllowed: false,
      returnForecastPercent: null,
    });
  }
  results.sort((a, b) =>
    a.missingConditions.length - b.missingConditions.length ||
    b.committeeScore - a.committeeScore ||
    a.riskScore - b.riskScore ||
    a.symbol.localeCompare(b.symbol));
  return results.slice(0, limit);
}
