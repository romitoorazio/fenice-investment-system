export type PaperEvidenceState = "MARKET_CLOSED_NO_RISK" | "RISK_REJECTED_NO_TRADE" | "RECORDED";

export type PaperEvidenceStateInput = {
  newPaperFills?: number;
  cumulativeRiskRejected?: number;
  auditChainValid?: boolean;
  reconciliationBalanced?: boolean;
  liveTradingAllowed?: boolean;
  brokerConnectivityAllowed?: boolean;
  marketSession?: {
    evidence?: {
      state?: string;
      authoritative?: boolean;
    };
    decision?: {
      allowed?: boolean;
    };
  };
};

function hasPersistedNoRiskSafety(evidence: PaperEvidenceStateInput): boolean {
  return Number(evidence.newPaperFills || 0) === 0
    && evidence.auditChainValid === true
    && evidence.reconciliationBalanced === true
    && evidence.liveTradingAllowed === false
    && evidence.brokerConnectivityAllowed === false;
}

export function classifyPaperEvidenceState(
  evidence: PaperEvidenceStateInput,
  previousEvidence?: PaperEvidenceStateInput | null,
): PaperEvidenceState {
  if (
    hasPersistedNoRiskSafety(evidence)
    && evidence.marketSession?.evidence?.authoritative === true
    && evidence.marketSession.evidence.state === "CLOSED"
    && evidence.marketSession.decision?.allowed === false
  ) {
    return "MARKET_CLOSED_NO_RISK";
  }

  // A lifetime total is not a rejection on today's PAPER evidence day.
  // The previous day must be supplied for all but the first recorded day.
  const current = evidence.cumulativeRiskRejected;
  const prior = previousEvidence?.cumulativeRiskRejected;
  const safeCount = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const newRejections = safeCount(current)
    && (previousEvidence === undefined || previousEvidence === null
      ? current > 0
      : safeCount(prior) && current > prior);
  if (hasPersistedNoRiskSafety(evidence) && newRejections) {
    return "RISK_REJECTED_NO_TRADE";
  }

  return "RECORDED";
}
