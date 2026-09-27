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

export function classifyPaperEvidenceState(evidence: PaperEvidenceStateInput): PaperEvidenceState {
  if (
    hasPersistedNoRiskSafety(evidence)
    && evidence.marketSession?.evidence?.authoritative === true
    && evidence.marketSession.evidence.state === "CLOSED"
    && evidence.marketSession.decision?.allowed === false
  ) {
    return "MARKET_CLOSED_NO_RISK";
  }

  if (hasPersistedNoRiskSafety(evidence) && Number(evidence.cumulativeRiskRejected || 0) > 0) {
    return "RISK_REJECTED_NO_TRADE";
  }

  return "RECORDED";
}
