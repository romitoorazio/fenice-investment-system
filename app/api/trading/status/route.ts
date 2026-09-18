import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDirectaBridgeStatus } from "@/lib/brokers/directa";
import { LIVE_TRADING_RELEASED } from "@/lib/brokers/safety";
import { evaluateKillSwitch } from "@/lib/trading/kill-switch";
import { DEFAULT_RISK_LIMITS } from "@/lib/trading/risk-engine";

export const dynamic = "force-dynamic";

async function readJson(name: string): Promise<Record<string, any>> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", name), "utf8"));
  } catch {
    return {};
  }
}

export async function GET() {
  const [governance, intelligence, sources, ledger] = await Promise.all([
    readJson("decision-governance.json"),
    readJson("intelligence-quality.json"),
    readJson("global-source-health.json"),
    readJson("decision-ledger.json"),
  ]);

  const criticalSources = Array.isArray(sources?.sources)
    ? sources.sources.filter((source: any) => source?.critical === true)
    : [];
  const staleCriticalSources = criticalSources.filter((source: any) => source?.stale === true || source?.status === "failed").length;
  const killSwitch = evaluateKillSwitch({
    manualEngaged: false,
    reconciliationBreaks: 0,
    consecutiveExecutionErrors: 0,
    staleCriticalSources,
    dailyLossPercent: 0,
    dataConfidence: Number(intelligence?.intelligenceConfidence || 0),
  });

  const directa = getDirectaBridgeStatus({
    requestedMode: "paper",
    apiAccessApproved: process.env.DIRECTA_API_ACCESS_APPROVED === "true",
    technicalContractVerified: process.env.DIRECTA_API_CONTRACT_VERIFIED === "true",
  });

  return Response.json({
    generatedAt: new Date().toISOString(),
    operatingMode: "PAPER",
    operational: true,
    liveTradingReleased: LIVE_TRADING_RELEASED,
    liveTradingAllowed: false,
    brokerNetworkAllowed: false,
    broker: directa,
    capabilities: {
      analysis: true,
      paperOms: true,
      preTradeRisk: true,
      idempotentClientOrderIds: true,
      simulatedFeesAndSlippage: true,
      reconciliation: true,
      tamperEvidentAuditChain: true,
      killSwitch: true,
      realOrderSubmission: false,
    },
    riskLimits: DEFAULT_RISK_LIMITS,
    killSwitch,
    governance: {
      regime: governance?.regime ?? "UNKNOWN",
      stressScore: governance?.stressScore ?? null,
      requireHumanConfirmation: governance?.guardrails?.requireHumanConfirmation === true,
      blockAutonomousTrading: governance?.guardrails?.blockAutonomousTrading === true,
    },
    dataQuality: {
      confidence: intelligence?.intelligenceConfidence ?? null,
      sourceConcentrationPercent: intelligence?.coverage?.sourceConcentrationPercent ?? null,
      crossChecks: intelligence?.crossSourceValidation?.checked ?? null,
      divergent: intelligence?.crossSourceValidation?.divergent ?? null,
    },
    paperEvidence: {
      records: Array.isArray(ledger?.records) ? ledger.records.length : 0,
    },
  });
}
