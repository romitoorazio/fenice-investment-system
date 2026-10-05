export type FeniceAIAction =
  | "BUY"
  | "ACCUMULATE"
  | "HOLD"
  | "WAIT"
  | "REDUCE"
  | "EXIT";

export type GateState = "PASS" | "BLOCK";

export interface FeniceAIThesis {
  symbol: string;
  action: FeniceAIAction;
  confidence: number;
  fsiScore: number;
  horizon: string;
  rationale: string[];
  catalysts: string[];
  invalidation: string[];
  generatedAt: string;
}

export interface FeniceSafetyContext {
  dataQuality: GateState;
  riskEngine: GateState;
  session: GateState;
  executionMarketData: GateState;
  duplicateOrderGuard: GateState;
  killSwitch: GateState;
  brokerWritesEnabled: boolean;
  liveTradingReleased: boolean;
}

export interface FeniceAIDecision {
  thesis: FeniceAIThesis;
  advisoryOnly: true;
  executable: boolean;
  blockedBy: string[];
}

/**
 * Fenice AI is advisory. It can rank and explain opportunities, but it never
 * grants execution authority. Existing deterministic safety gates remain the
 * authority and every missing/failed prerequisite blocks execution.
 */
export function evaluateFeniceAIThesis(
  thesis: FeniceAIThesis,
  safety: FeniceSafetyContext,
): FeniceAIDecision {
  const blockedBy: string[] = [];

  if (!Number.isFinite(thesis.confidence) || thesis.confidence < 0 || thesis.confidence > 100) {
    blockedBy.push("INVALID_AI_CONFIDENCE");
  }
  if (!Number.isFinite(thesis.fsiScore) || thesis.fsiScore < 0 || thesis.fsiScore > 100) {
    blockedBy.push("INVALID_FSI_SCORE");
  }
  if (safety.dataQuality !== "PASS") blockedBy.push("DATA_QUALITY");
  if (safety.riskEngine !== "PASS") blockedBy.push("RISK_ENGINE");
  if (safety.session !== "PASS") blockedBy.push("SESSION");
  if (safety.executionMarketData !== "PASS") blockedBy.push("EXECUTION_MARKET_DATA");
  if (safety.duplicateOrderGuard !== "PASS") blockedBy.push("DUPLICATE_ORDER_GUARD");
  if (safety.killSwitch !== "PASS") blockedBy.push("KILL_SWITCH");
  if (!safety.brokerWritesEnabled) blockedBy.push("BROKER_WRITES_DISABLED");
  if (!safety.liveTradingReleased) blockedBy.push("LIVE_NOT_RELEASED");

  return {
    thesis,
    advisoryOnly: true,
    executable: blockedBy.length === 0,
    blockedBy,
  };
}

export function assertAIHasNoExecutionAuthority(decision: FeniceAIDecision): void {
  if (!decision.advisoryOnly) {
    throw new Error("FENICE_AI_AUTHORITY_VIOLATION");
  }
}
