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
  executable: false;
  proposalEligible: boolean;
  blockedBy: string[];
}

const actions = new Set(["BUY", "ACCUMULATE", "HOLD", "WAIT", "REDUCE", "EXIT"]);
export const AI_THESIS_MAX_AGE_MS = 24 * 3_600_000;
export const isFeniceScore = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
const textList = (value: unknown, required: boolean) => Array.isArray(value)
  && (!required || value.length > 0)
  && value.every((item) => typeof item === "string" && item.trim().length > 0);

/** Model output is untrusted input. A valid thesis is still only research. */
export function validateFeniceAIThesis(thesis: FeniceAIThesis, now = Date.now()): string[] {
  const errors: string[] = [];
  if (!isFeniceScore(thesis?.confidence)) errors.push("INVALID_AI_CONFIDENCE");
  if (!isFeniceScore(thesis?.fsiScore)) errors.push("INVALID_FSI_SCORE");
  if (typeof thesis?.symbol !== "string" || !/^[A-Z0-9][A-Z0-9._:/-]{0,39}$/.test(thesis.symbol)) errors.push("INVALID_SYMBOL");
  if (!actions.has(thesis?.action)) errors.push("INVALID_AI_ACTION");
  if (typeof thesis?.horizon !== "string" || !thesis.horizon.trim()) errors.push("INVALID_HORIZON");
  if (!textList(thesis?.rationale, true)) errors.push("MISSING_RATIONALE");
  if (!textList(thesis?.catalysts, false)) errors.push("INVALID_CATALYSTS");
  if (!textList(thesis?.invalidation, true)) errors.push("MISSING_INVALIDATION");
  const generated = typeof thesis?.generatedAt === "string" ? Date.parse(thesis.generatedAt) : NaN;
  if (!Number.isFinite(now) || !Number.isFinite(generated)) errors.push("INVALID_GENERATED_AT");
  else if (generated > now) errors.push("FUTURE_AI_THESIS");
  else if (now - generated > AI_THESIS_MAX_AGE_MS) errors.push("STALE_AI_THESIS");
  return errors;
}

export function evaluateFeniceAIThesis(thesis: FeniceAIThesis, safety: FeniceSafetyContext, now = Date.now()): FeniceAIDecision {
  const blockedBy = validateFeniceAIThesis(thesis, now);
  if (!isFeniceScore(thesis?.confidence) || thesis.confidence < 90) blockedBy.push("AI_CONFIDENCE_BELOW_PROPOSAL_FLOOR");
  if (!["BUY", "ACCUMULATE"].includes(thesis?.action)) blockedBy.push("AI_ACTION_NOT_BUY_PROPOSAL");
  if (safety?.dataQuality !== "PASS") blockedBy.push("DATA_QUALITY");
  if (safety?.riskEngine !== "PASS") blockedBy.push("RISK_ENGINE");
  if (safety?.session !== "PASS") blockedBy.push("SESSION");
  if (safety?.executionMarketData !== "PASS") blockedBy.push("EXECUTION_MARKET_DATA");
  if (safety?.duplicateOrderGuard !== "PASS") blockedBy.push("DUPLICATE_ORDER_GUARD");
  if (safety?.killSwitch !== "PASS") blockedBy.push("KILL_SWITCH");
  // Closed LIVE/broker locks allow a PAPER proposal; they never grant the AI
  // execution authority. Opening either lock invalidates this PAPER path.
  if (safety?.brokerWritesEnabled !== false) blockedBy.push("PAPER_BROKER_LOCK_INVALID");
  if (safety?.liveTradingReleased !== false) blockedBy.push("PAPER_LIVE_LOCK_INVALID");
  return { thesis, advisoryOnly: true, executable: false, proposalEligible: blockedBy.length === 0, blockedBy };
}

export function assertAIHasNoExecutionAuthority(decision: FeniceAIDecision): void {
  if (decision?.advisoryOnly !== true || decision?.executable !== false) throw new Error("FENICE_AI_AUTHORITY_VIOLATION");
}
