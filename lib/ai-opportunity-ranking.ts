import type { FeniceAIThesis } from "./ai-intelligence-core";

export type FeniceHorizon = "INTRADAY" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS";

export interface FeniceOpportunity extends FeniceAIThesis {
  horizonBucket: FeniceHorizon;
  valuationScore: number;
  qualityScore: number;
  momentumScore: number;
  catalystScore: number;
  asymmetryScore: number;
  systemicRiskPenalty: number;
  evidenceQuality: number;
}

export interface RankedFeniceOpportunity extends FeniceOpportunity {
  rankScore: number;
}

function bounded(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

/**
 * Deterministic ranking. AI supplies structured observations; this function
 * computes the ranking so model prose cannot secretly alter portfolio priority.
 */
export function scoreFeniceOpportunity(item: FeniceOpportunity): number {
  const positive =
    bounded(item.asymmetryScore) * 0.25 +
    bounded(item.qualityScore) * 0.18 +
    bounded(item.valuationScore) * 0.14 +
    bounded(item.momentumScore) * 0.12 +
    bounded(item.catalystScore) * 0.13 +
    bounded(item.fsiScore) * 0.10 +
    bounded(item.evidenceQuality) * 0.08;

  const penalty = bounded(item.systemicRiskPenalty) * 0.25;
  return Math.round(Math.max(0, Math.min(100, positive - penalty)) * 100) / 100;
}

export function rankFeniceOpportunities(items: FeniceOpportunity[], limit = 10): RankedFeniceOpportunity[] {
  return items
    .map((item) => ({ ...item, rankScore: scoreFeniceOpportunity(item) }))
    .sort((a, b) => b.rankScore - a.rankScore || b.confidence - a.confidence)
    .slice(0, Math.max(0, limit));
}
