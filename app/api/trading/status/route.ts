import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDirectaBridgeStatus } from "@/lib/brokers/directa";
import { LIVE_TRADING_RELEASED } from "@/lib/brokers/safety";
import { DEFAULT_RISK_LIMITS } from "@/lib/trading/risk-engine";
import { buildTradingStatusEvidence } from "@/lib/ui/trading-status-evidence";

export const dynamic = "force-dynamic";

type GovernanceDoc = {
  regime?: string;
  stressScore?: number;
  guardrails?: {
    requireHumanConfirmation?: boolean;
    blockAutonomousTrading?: boolean;
  };
};

type IntelligenceDoc = {
  intelligenceConfidence?: number;
  coverage?: { sourceConcentrationPercent?: number };
  crossSourceValidation?: { checked?: number; divergent?: number };
};

type LedgerDoc = { records?: unknown[] };

async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", name), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  const [governance, intelligence, sources, ledger, state] = await Promise.all([
    readJson<GovernanceDoc>("decision-governance.json"),
    readJson<IntelligenceDoc>("intelligence-quality.json"),
    readJson<unknown>("global-source-health.json"),
    readJson<LedgerDoc>("decision-ledger.json"),
    readJson<unknown>("paper-oms-state.json"),
  ]);
  const evidence = buildTradingStatusEvidence({ state, sources, intelligence });

  const directa = getDirectaBridgeStatus({
    requestedMode: "paper",
    apiAccessApproved: process.env.DIRECTA_API_ACCESS_APPROVED === "true",
    technicalContractVerified: process.env.DIRECTA_API_CONTRACT_VERIFIED === "true",
  });

  return Response.json({
    generatedAt: new Date().toISOString(),
    operatingMode: "PAPER",
    operational: evidence.operational,
    readOnlyDiagnostic: evidence.readOnlyDiagnostic,
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
    killSwitch: evidence.killSwitch,
    paperState: evidence.paperState,
    governance: {
      regime: governance?.regime ?? "UNKNOWN",
      stressScore: governance?.stressScore ?? null,
      requireHumanConfirmation: governance?.guardrails?.requireHumanConfirmation === true,
      blockAutonomousTrading: governance?.guardrails?.blockAutonomousTrading === true,
    },
    dataQuality: {
      ...evidence.dataQuality,
      sourceConcentrationPercent: intelligence?.coverage?.sourceConcentrationPercent ?? null,
      crossChecks: intelligence?.crossSourceValidation?.checked ?? null,
      divergent: intelligence?.crossSourceValidation?.divergent ?? null,
    },
    paperEvidence: {
      records: Array.isArray(ledger?.records) ? ledger.records.length : 0,
      recordKind: "RESEARCH_DECISION_LEDGER",
      paperFills: evidence.paperState.paperFillCount,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
