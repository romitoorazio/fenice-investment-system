import { isFeniceScore, validateFeniceAIThesis, type FeniceAIThesis } from "./ai-intelligence-core.ts";

export type FeniceHorizon = "INTRADAY" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS";
export interface FeniceOpportunity extends FeniceAIThesis { horizonBucket: FeniceHorizon; valuationScore: number; qualityScore: number; momentumScore: number; catalystScore: number; asymmetryScore: number; systemicRiskPenalty: number; evidenceQuality: number; }
export interface RankedFeniceOpportunity extends FeniceOpportunity { rankScore: number; }
const horizons = new Set(["INTRADAY", "DAYS", "WEEKS", "MONTHS", "YEARS"]);
function validOpportunity(item: FeniceOpportunity, now: number): boolean {
  return validateFeniceAIThesis(item, now).length === 0 && horizons.has(item?.horizonBucket)
    && [item?.asymmetryScore, item?.qualityScore, item?.valuationScore, item?.momentumScore,
      item?.catalystScore, item?.evidenceQuality, item?.systemicRiskPenalty].every(isFeniceScore);
}
export function scoreFeniceOpportunity(item: FeniceOpportunity, now = Date.now()): number {
  if (!validOpportunity(item, now)) return 0;
  const positive = item.asymmetryScore*0.25 + item.qualityScore*0.18 + item.valuationScore*0.14 + item.momentumScore*0.12 + item.catalystScore*0.13 + item.fsiScore*0.10 + item.evidenceQuality*0.08;
  const penalty = item.systemicRiskPenalty*0.25;
  return Math.round(Math.max(0, Math.min(100, positive-penalty))*100)/100;
}
export function rankFeniceOpportunities(items: FeniceOpportunity[], limit=10, now = Date.now()): RankedFeniceOpportunity[] {
  if (!Array.isArray(items) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return [];
  const ranked = items.filter(item => validOpportunity(item, now)).map(item=>({...item,rankScore:scoreFeniceOpportunity(item, now)}))
    .sort((a,b)=>b.rankScore-a.rankScore || b.confidence-a.confidence || Date.parse(b.generatedAt)-Date.parse(a.generatedAt)
      || a.symbol.localeCompare(b.symbol) || a.horizonBucket.localeCompare(b.horizonBucket));
  const seen = new Set<string>();
  return ranked.filter(item => {
    const key = `${item.symbol}:${item.horizonBucket}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0,limit);
}
