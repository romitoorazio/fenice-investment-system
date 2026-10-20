import committee from "@/data/investment-committee.json";
import quality from "@/data/intelligence-quality.json";
import sourceHealth from "@/data/global-source-health.json";
import campaign from "@/data/paper-validation-campaign.json";
import calibration from "@/data/calibration-analysis.json";
import worldFunnel from "@/data/world-equity-funnel-status.json";
import worldProviders from "@/data/world-v7-provider-observation.json";
import worldEod from "@/data/world-v7-eod-research.json";
// Shared read-only snapshots: the UI, deterministic analyst and optional
// manually authorized OpenAI explanation must read the same saved evidence.
export const feniceAnalystContext = {
  committee, quality, sources: sourceHealth, campaign, calibration,
  world: { funnel: worldFunnel, providers: worldProviders, eod: worldEod },
};
