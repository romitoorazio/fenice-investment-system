import terminal from "@/data/terminal-intelligence.json";
import alerts from "@/data/terminal-alerts.json";
import type { TerminalAlert, TerminalReport } from "@/lib/terminal";
import { buildRuntimeTerminal } from "@/lib/terminal-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const alertCount = (alerts as { alerts: TerminalAlert[] }).alerts.length;
  const report = buildRuntimeTerminal(terminal as TerminalReport, alertCount);
  const decisions = Object.fromEntries(
    ["ACCUMULA", "MANTIENI", "ATTENDI", "SPECULATIVA", "EVITA"].map((decision) => [
      decision,
      report.assets.filter((asset) => asset.decision === decision).length,
    ]),
  );
  const weightedAssets = report.assets
    .filter((asset) => asset.targetWeightPercent > 0)
    .map((asset) => ({
      symbol: asset.symbol,
      decision: asset.decision,
      score: asset.unifiedScore,
      risk: asset.riskScore,
      weightPercent: asset.targetWeightPercent,
      amountEuro: asset.targetAmountEuro,
    }));
  const invalidWeightedAssets = weightedAssets.filter((asset) => ["ATTENDI", "EVITA"].includes(asset.decision));
  const healthy = Boolean(
    report.coveragePercent === 100 &&
    report.allocationCheck?.valid &&
    !report.guardrails?.violations.length &&
    invalidWeightedAssets.length === 0,
  );

  return Response.json({
    status: healthy ? "healthy" : "degraded",
    generatedAt: report.generatedAt,
    validatedAt: report.validatedAt,
    coveragePercent: report.coveragePercent,
    dataQuality: report.dataQuality,
    freshnessStatus: report.freshnessStatus,
    freshAssetCount: report.freshAssetCount,
    assetCount: report.assetCount,
    marketRegime: report.marketRegime,
    decisions,
    allocation: report.allocationCheck,
    portfolio: report.portfolio.map((slice) => ({ id: slice.id, percent: slice.targetPercent, amountEuro: slice.targetAmountEuro })),
    guardrails: report.guardrails,
    invalidWeightedAssets,
    weightedAssets,
    alertsCount: report.alertsCount,
  }, {
    status: healthy ? 200 : 503,
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
