import intelligence from "@/data/intelligence-quality.json";
import executionMarket from "@/data/execution-market-evidence.json";
import executionCoverage from "@/data/execution-market-coverage.json";
import paperCampaign from "@/data/paper-validation-campaign.json";
import { LIVE_TRADING_RELEASED } from "@/lib/brokers/safety";
import { evaluateExecutionReadiness } from "@/lib/trading/execution-readiness";
import { buildInstitutionalReadiness } from "@/lib/trading/readiness-evidence";
import { derivePaperRuntimeEvidence } from "@/lib/ui/paper-runtime-evidence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const executionReadiness = evaluateExecutionReadiness(executionMarket, executionCoverage);
  const paperRuntimeEvidence = derivePaperRuntimeEvidence(paperCampaign);
  const readiness = buildInstitutionalReadiness(intelligence, {
    executionMarketQuorumVerified: executionReadiness.verified,
    // These controls require runtime evidence from the local Directa bridge,
    // reconciliation/recovery proofs or time-matured validation. Cloud code
    // must never mark them PASS by itself.
    brokerReadOnlyVerified: false,
    brokerReconciliationVerified: false,
    shadowExecutionVerified: false,
    recoveryVerified: false,
    persistentAuditVerified: false,
    heartbeatWatchdogVerified: false,
    marketSessionControlsVerified: paperRuntimeEvidence.marketSessionControlsVerified,
    fxExposureVerified: paperRuntimeEvidence.fxExposureVerified,
    paper30dVerified: false,
    chaosTestsVerified: false,
  });

  return Response.json({
    generatedAt: new Date().toISOString(),
    ...readiness,
    executionReadiness,
    paperRuntimeEvidence,
    liveTradingReleased: LIVE_TRADING_RELEASED,
    liveTradingAllowed: false,
    capitalReady: false,
    note: executionReadiness.ownerActionRequired
      ? executionReadiness.ownerAction
      : "Engineering readiness is not authorization to trade. PAPER quote quorum, recovery/audit evidence and time-matured validation must all pass before any future capital-release review.",
  });
}
