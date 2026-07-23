export type CoverageState = "active" | "foundation" | "planned" | "blocked";

export type CoverageItem = {
  id: string;
  label: string;
  state: CoverageState;
  authorityScore: number;
  freshnessScore: number;
  geographicScore: number;
  assetClassScore: number;
  missingRequirements?: string[];
};

export type CoverageAssessment = {
  score: number;
  state: CoverageState;
  blockers: string[];
  components: {
    authority: number;
    freshness: number;
    geography: number;
    assetClass: number;
  };
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function assessCoverage(item: CoverageItem): CoverageAssessment {
  const components = {
    authority: clamp(item.authorityScore),
    freshness: clamp(item.freshnessScore),
    geography: clamp(item.geographicScore),
    assetClass: clamp(item.assetClassScore),
  };

  const score = Math.round(
    components.authority * 0.35 +
      components.freshness * 0.25 +
      components.geography * 0.2 +
      components.assetClass * 0.2,
  );

  const blockers = item.missingRequirements ?? [];
  const state: CoverageState = blockers.length > 0 ? "blocked" : item.state;

  return { score, state, blockers, components };
}

export function rankCoverageGaps(items: CoverageItem[]) {
  return items
    .map((item) => ({ ...item, assessment: assessCoverage(item) }))
    .sort((a, b) => {
      if (a.assessment.state === "blocked" && b.assessment.state !== "blocked") return -1;
      if (b.assessment.state === "blocked" && a.assessment.state !== "blocked") return 1;
      return a.assessment.score - b.assessment.score;
    });
}
