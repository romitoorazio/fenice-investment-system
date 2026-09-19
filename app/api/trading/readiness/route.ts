import intelligence from "@/data/intelligence-quality.json";
import { LIVE_TRADING_RELEASED } from "@/lib/brokers/safety";
import { buildInstitutionalReadiness } from "@/lib/trading/readiness-evidence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const readiness = buildInstitutionalReadiness(intelligence, {
    // These controls require runtime evidence from the local Directa bridge or
    // time-matured validation. Cloud code must never mark them PASS by itself.
    brokerReadOnlyVerified: false,
    brokerReconciliationVerified: false,
    shadowExecutionVerified: false,
    recoveryVerified: false,
    persistentAuditVerified: false,
    heartbeatWatchdogVerified: false,
    marketSessionControlsVerified: false,
    fxExposureVerified: false,
    paper30dVerified: false,
    chaosTestsVerified: false,
  });

  return Response.json({
    generatedAt: new Date().toISOString(),
    ...readiness,
    liveTradingReleased: LIVE_TRADING_RELEASED,
    liveTradingAllowed: false,
    capitalReady: false,
    note: "Engineering readiness is not authorization to trade. Runtime Directa evidence and time-matured paper/shadow validation are still required.",
  });
}
