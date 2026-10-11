/**
 * Presentation-only, fail-closed classification for the public Compra/Vendi page.
 * The technical terminal signal never grants permission for trading.
 * This module does not submit orders or alter PAPER V6 evidence.
 */
export type CommitteeDecision = {
  symbol: string;
  decision?: string;
  committeeScore?: number;
  entryPlan?: { orderMode?: string; firstTrancheEuro?: number };
};

export type CommitteeDisplayGroup = "CANDIDATO" | "OSSERVA" | "ATTENDI" | "EVITA";

export function decisionGroup(
  decision: CommitteeDecision | undefined,
  committeeFresh: boolean,
  executionGate: string,
  reportedBuyCandidates: number,
): CommitteeDisplayGroup {
  if (!committeeFresh || !decision) return "ATTENDI";
  if (decision.decision === "EVITA") return "EVITA";

  if (decision.decision === "COMPRA") {
    const plan = decision.entryPlan;
    // A potential buy is shown as research-only ONLY when all committee
    // evidence agrees. Even CANDIDATO does not authorize broker execution.
    return executionGate === "PRONTO_CON_CONFERMA"
      && Number.isInteger(reportedBuyCandidates)
      && reportedBuyCandidates > 0
      && plan?.orderMode === "LIMITE"
      && typeof plan.firstTrancheEuro === "number"
      && Number.isFinite(plan.firstTrancheEuro)
      && plan.firstTrancheEuro > 0
      ? "CANDIDATO" : "OSSERVA";
  }

  if (decision.decision === "OSSERVA" || decision.decision === "MANTIENI") return "OSSERVA";
  return "ATTENDI";
}
