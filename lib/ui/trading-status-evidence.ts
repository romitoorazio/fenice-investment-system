import { verifyAuditChain, type AuditEvent } from "../trading/audit-chain.ts";
import { evaluateDecisionDataGate } from "../trading/decision-data-gate.mjs";
import { evaluateKillSwitch } from "../trading/kill-switch.ts";
import { reconcilePaperExecutions } from "../trading/reconciliation.ts";
import type { PaperExecution, Position } from "../trading/types.ts";

type Doc = Record<string, unknown>;
const object = (value: unknown): value is Doc => value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const count = (value: unknown): value is number => finite(value) && Number.isInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function snapshotAge(timestamp: unknown, now: number) {
  const parsed = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
  return Number.isFinite(parsed) && parsed <= now ? (now - parsed) / 60_000 : null;
}

function executionValid(value: unknown): value is Doc {
  return object(value) && text(value.clientOrderId) && text(value.symbol)
    && (value.side === "BUY" || value.side === "SELL")
    && (value.status === "PAPER_FILLED" || value.status === "RISK_REJECTED")
    && finite(value.filledQuantity) && value.filledQuantity >= 0
    && (value.status !== "PAPER_FILLED" || value.filledQuantity > 0);
}

function positionValid(value: unknown): value is Doc {
  return object(value) && text(value.symbol) && text(value.currency)
    && finite(value.quantity) && value.quantity >= 0
    && finite(value.averagePrice) && value.averagePrice >= 0;
}

/** Read-only diagnostics of persisted PAPER evidence; never an execution authority. */
export function buildTradingStatusEvidence({
  state,
  sources,
  intelligence,
  now = Date.now(),
}: { state: unknown; sources: unknown; intelligence: unknown; now?: number }) {
  if (!Number.isFinite(now)) throw new Error("Invalid trading status clock");
  const paper = object(state) ? state : {};
  const health = object(sources) ? sources : {};
  const quality = object(intelligence) ? intelligence : {};
  const storedKillSwitch = object(paper.killSwitch) ? paper.killSwitch : {};
  const storedReconciliation = object(paper.reconciliation) ? paper.reconciliation : {};
  const sourceAgeMinutes = snapshotAge(health.generatedAt, now);
  const intelligenceAgeMinutes = snapshotAge(quality.generatedAt, now);
  const stateAgeMinutes = snapshotAge(paper.generatedAt, now);
  const reasons: string[] = [];

  const executions = Array.isArray(paper.executions) && paper.executions.every(executionValid) ? paper.executions : null;
  const positions = Array.isArray(paper.positions) && paper.positions.every(positionValid) ? paper.positions : null;
  const uniqueExecutionIds = executions !== null && new Set(executions.map(item => item.clientOrderId)).size === executions.length;
  const uniquePositionSymbols = positions !== null && new Set(positions.map(item => String(item.symbol).toUpperCase())).size === positions.length;
  if (paper.mode !== "PAPER" || paper.liveTradingAllowed !== false || paper.brokerConnectivityAllowed !== false) {
    reasons.push("PAPER state and explicit LIVE/broker locks are required");
  }
  if (stateAgeMinutes === null) reasons.push("PAPER snapshot timestamp is missing, invalid or future-dated");
  if (!executions || !positions || !uniqueExecutionIds || !uniquePositionSymbols || !Array.isArray(paper.openOrders)
    || !paper.openOrders.every(object)) reasons.push("PAPER execution, position or open-order evidence is invalid");
  if (typeof paper.operational !== "boolean" || typeof storedKillSwitch.engaged !== "boolean"
    || typeof storedKillSwitch.manualEngaged !== "boolean") reasons.push("PAPER operational or kill-switch state is missing");

  let auditChainValid = false;
  if (Array.isArray(paper.auditChain) && paper.auditChain.every(object)) {
    try {
      const chain = paper.auditChain as AuditEvent[];
      auditChainValid = verifyAuditChain(chain).valid && executions !== null && uniqueExecutionIds
        && executions.every(execution => chain.some(event => event.entityId === execution.clientOrderId
          && event.eventType === execution.status && object(event.payload)
          && event.payload.symbol === execution.symbol && event.payload.side === execution.side
          && event.payload.filledQuantity === execution.filledQuantity));
    } catch { /* A malformed journal never becomes a healthy diagnostic. */ }
  }
  if (!auditChainValid) reasons.push("PAPER audit integrity or execution coverage is invalid");

  let computedReconciliationBreaks: number | null = null;
  if (executions && positions && uniqueExecutionIds && uniquePositionSymbols) {
    computedReconciliationBreaks = reconcilePaperExecutions([], executions as PaperExecution[], positions as Position[]).breaks.length;
  }
  const storedBreaks = Array.isArray(storedReconciliation.breaks) ? storedReconciliation.breaks.length : null;
  const reconciliationBalanced = storedReconciliation.balanced === true && storedBreaks === 0 && computedReconciliationBreaks === 0;
  if (!reconciliationBalanced) reasons.push("PAPER reconciliation is missing or has unresolved differences");

  const optionalCountersValid = (paper.consecutiveExecutionErrors === undefined || count(paper.consecutiveExecutionErrors))
    && (paper.dailyLossPercent === undefined || finite(paper.dailyLossPercent));
  if (!optionalCountersValid) reasons.push("PAPER risk counters are invalid");

  const sourceRows = Array.isArray(health.sources) && health.sources.every(object) ? health.sources : [];
  const criticalSources = sourceRows.filter(source => source.critical === true);
  const critical = object(health.critical) ? health.critical : {};
  const staleCriticalSources = criticalSources.filter(source => source.stale !== false || source.status !== "healthy").length;
  const sourcesVerified = sourceAgeMinutes !== null && sourceAgeMinutes <= 24 * 60
    && criticalSources.length > 0 && critical.gate === "GREEN"
    && critical.total === criticalSources.length && critical.ready === critical.total && staleCriticalSources === 0;
  if (!sourcesVerified) reasons.push("Critical source evidence is missing, stale or not GREEN");
  const confidence = finite(quality.intelligenceConfidence) && quality.intelligenceConfidence >= 0 && quality.intelligenceConfidence <= 100
    ? quality.intelligenceConfidence : null;
  const intelligenceVerified = intelligenceAgeMinutes !== null && intelligenceAgeMinutes <= 24 * 60 && confidence !== null;
  if (!intelligenceVerified) reasons.push("Intelligence snapshot is missing, stale or invalid");

  const evaluatedKillSwitch = evaluateKillSwitch({
    manualEngaged: storedKillSwitch.manualEngaged === true,
    reconciliationBreaks: Math.max(storedBreaks ?? 1, computedReconciliationBreaks ?? 1, reconciliationBalanced ? 0 : 1),
    consecutiveExecutionErrors: count(paper.consecutiveExecutionErrors) ? paper.consecutiveExecutionErrors : 0,
    staleCriticalSources: sourcesVerified ? 0 : Math.max(1, staleCriticalSources),
    dailyLossPercent: finite(paper.dailyLossPercent) ? paper.dailyLossPercent : 0,
    dataConfidence: intelligenceVerified ? confidence! : 0,
    auditChainValid,
  });
  if (storedKillSwitch.engaged === true) reasons.push("Persisted PAPER kill switch is engaged");
  if (paper.operational === false) reasons.push("Persisted PAPER state is not operational");
  const killSwitchReasons = [...new Set([...reasons, ...evaluatedKillSwitch.reasons])];
  const decisionDataGate = evaluateDecisionDataGate({ sourceHealth: sources, intelligence, now });
  const paperStateVerified = paper.mode === "PAPER" && paper.liveTradingAllowed === false && paper.brokerConnectivityAllowed === false
    && stateAgeMinutes !== null && Boolean(executions && positions && uniqueExecutionIds && uniquePositionSymbols)
    && Array.isArray(paper.openOrders) && paper.openOrders.every(object)
    && typeof paper.operational === "boolean" && typeof storedKillSwitch.engaged === "boolean"
    && typeof storedKillSwitch.manualEngaged === "boolean" && auditChainValid && reconciliationBalanced && optionalCountersValid;

  return {
    operational: paperStateVerified && paper.operational === true && killSwitchReasons.length === 0,
    readOnlyDiagnostic: true,
    liveTradingAllowed: false,
    brokerNetworkAllowed: false,
    killSwitch: { engaged: killSwitchReasons.length > 0, reasons: killSwitchReasons },
    paperState: {
      verified: paperStateVerified,
      generatedAt: typeof paper.generatedAt === "string" ? paper.generatedAt : null,
      ageMinutes: stateAgeMinutes === null ? null : Number(stateAgeMinutes.toFixed(1)),
      reportedOperational: typeof paper.operational === "boolean" ? paper.operational : null,
      auditChainValid,
      reconciliationBalanced,
      reconciliationBreaks: computedReconciliationBreaks,
      recordedReconciliationBreaks: storedBreaks,
      executionCount: executions?.length ?? null,
      paperFillCount: executions?.filter(item => item.status === "PAPER_FILLED").length ?? null,
      positionCount: positions?.length ?? null,
      consecutiveExecutionErrors: count(paper.consecutiveExecutionErrors) ? paper.consecutiveExecutionErrors : null,
      dailyLossPercent: finite(paper.dailyLossPercent) ? paper.dailyLossPercent : null,
    },
    dataQuality: {
      confidence,
      generatedAt: typeof quality.generatedAt === "string" ? quality.generatedAt : null,
      ageMinutes: intelligenceAgeMinutes === null ? null : Number(intelligenceAgeMinutes.toFixed(1)),
      sourceHealthGeneratedAt: typeof health.generatedAt === "string" ? health.generatedAt : null,
      sourceHealthAgeMinutes: sourceAgeMinutes === null ? null : Number(sourceAgeMinutes.toFixed(1)),
      decisionDataReady: decisionDataGate.ready,
      decisionDataReasons: decisionDataGate.reasons,
    },
  };
}
