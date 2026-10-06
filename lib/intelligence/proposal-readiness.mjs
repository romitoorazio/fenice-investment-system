const finite = (value) => Number.isFinite(Number(value));
const upper = (value) => String(value ?? "").trim().toUpperCase();
const asArray = (value) => Array.isArray(value) ? value : [];
const fresh = (timestamp, now, maxAgeMs) => {
  const parsed = Date.parse(String(timestamp ?? ""));
  return Number.isFinite(parsed) && parsed <= now && now - parsed <= maxAgeMs;
};

function add(blockers, condition, code) {
  if (condition) blockers.push(code);
}

export function buildV7ProposalReadiness({
  approval,
  committee,
  coverage,
  marketSession,
} = {}, now = Date.now()) {
  if (!Number.isFinite(now)) throw new Error("INVALID_READINESS_CLOCK");

  const globalBlockers = [];
  add(globalBlockers, approval?.approved !== true || upper(approval?.mode) !== "PAPER", "PAPER_APPROVAL_NOT_ACTIVE");
  add(globalBlockers, approval?.liveTradingAllowed !== false, "LIVE_LOCK_NOT_VERIFIED");
  add(globalBlockers, approval?.brokerConnectivityAllowed !== false, "BROKER_LOCK_NOT_VERIFIED");
  const approvalExpiry = Date.parse(String(approval?.expiresAt ?? ""));
  add(globalBlockers, !Number.isFinite(approvalExpiry) || approvalExpiry <= now, "PAPER_APPROVAL_EXPIRED");

  const minCommitteeScore = finite(approval?.minCommitteeScore) ? Number(approval.minCommitteeScore) : 101;
  const minValidationDataConfidence = finite(approval?.minValidationDataConfidence) ? Number(approval.minValidationDataConfidence) : 101;
  const maxRiskScore = finite(approval?.maxRiskScore) ? Number(approval.maxRiskScore) : -1;
  const permittedDecisionStates = new Set(asArray(approval?.permittedDecisionStates).map(upper).filter(Boolean));
  const permittedCurrencies = new Set(asArray(approval?.permittedCurrencies).map(upper).filter(Boolean));
  add(globalBlockers,
    minCommitteeScore < 0 || minCommitteeScore > 100
      || minValidationDataConfidence < 0 || minValidationDataConfidence > 100
      || maxRiskScore < 0 || maxRiskScore > 100
      || permittedDecisionStates.size === 0 || permittedCurrencies.size === 0,
    "PAPER_APPROVAL_THRESHOLDS_INVALID",
  );

  add(globalBlockers, upper(committee?.sourceGate) !== "GREEN", "COMMITTEE_SOURCE_GATE_NOT_GREEN");
  add(globalBlockers, !fresh(committee?.generatedAt, now, 24 * 60 * 60 * 1000), "COMMITTEE_STALE");
  add(globalBlockers, coverage?.policy?.requiredEligibility !== "PAPER", "COVERAGE_POLICY_NOT_PAPER");
  add(globalBlockers, coverage?.policy?.liveTradingAllowed !== false, "COVERAGE_LIVE_LOCK_NOT_VERIFIED");
  add(globalBlockers, Number(coverage?.policy?.minIndependentSourceFamilies ?? 0) < 2, "COVERAGE_QUORUM_POLICY_WEAK");
  add(globalBlockers, !fresh(coverage?.generatedAt, now, 30 * 60 * 1000), "EXECUTION_COVERAGE_STALE");

  add(globalBlockers, marketSession?.configured !== true, "MARKET_SESSION_NOT_CONFIGURED");
  add(globalBlockers, marketSession?.liveTradingAllowed !== false, "MARKET_SESSION_LIVE_LOCK_NOT_VERIFIED");
  add(globalBlockers, marketSession?.decision?.allowed !== true, "MARKET_SESSION_NOT_OPEN");
  add(globalBlockers, !fresh(marketSession?.evidence?.observedAt, now, 60_000), "MARKET_SESSION_STALE");

  const coverageBySymbol = new Map(asArray(coverage?.rows).map((row) => [upper(row?.symbol), row]));
  const candidates = asArray(committee?.allDecisions).length ? committee.allDecisions : asArray(committee?.topDecisions);

  const rows = candidates
    .filter((candidate) => upper(candidate?.symbol))
    .map((candidate) => {
      const symbol = upper(candidate.symbol);
      const rowCoverage = coverageBySymbol.get(symbol);
      const committeeScore = Number(candidate?.committeeScore);
      const confidence = Number(candidate?.confidence);
      const riskScore = Number(candidate?.riskScore);
      const decision = upper(candidate?.decision);
      const terminalDecision = upper(candidate?.terminalDecision);
      const currency = upper(candidate?.currency);
      const sourceFamilies = Number(rowCoverage?.independentSourceFamilies ?? 0);

      const probeBlockers = [];
      add(probeBlockers, !finite(committeeScore) || committeeScore < minCommitteeScore, "COMMITTEE_SCORE_BELOW_PAPER_MINIMUM");
      add(probeBlockers, !finite(confidence) || confidence < minValidationDataConfidence, "CALIBRATED_CONFIDENCE_BELOW_PAPER_MINIMUM");
      add(probeBlockers, !finite(riskScore) || riskScore > maxRiskScore, "RISK_SCORE_ABOVE_PAPER_MAXIMUM");
      add(probeBlockers, !permittedDecisionStates.has(decision), "DECISION_STATE_NOT_PERMITTED_FOR_PAPER");
      add(probeBlockers, !permittedCurrencies.has(currency), "CURRENCY_NOT_PERMITTED_FOR_PAPER");
      add(probeBlockers, rowCoverage?.paperEligible !== true, "PAPER_EXECUTION_COVERAGE_NOT_ELIGIBLE");
      add(probeBlockers, !Number.isSafeInteger(sourceFamilies) || sourceFamilies < 2, "PAPER_SOURCE_QUORUM_NOT_MET");

      const proposalBlockers = [...probeBlockers];
      add(proposalBlockers, decision !== "COMPRA", "COMMITTEE_NOT_BUY");
      add(proposalBlockers, terminalDecision !== "ACCUMULA", "TERMINAL_NOT_ACCUMULA");
      add(proposalBlockers, upper(candidate?.entryPlan?.orderMode) !== "LIMITE", "ENTRY_PLAN_NOT_LIMIT");
      add(proposalBlockers, !finite(candidate?.entryPlan?.maxEntryPrice) || Number(candidate.entryPlan.maxEntryPrice) <= 0, "ENTRY_LIMIT_PRICE_MISSING");
      add(proposalBlockers, !finite(candidate?.entryPlan?.firstTrancheEuro) || Number(candidate.entryPlan.firstTrancheEuro) <= 0, "ENTRY_TRANCHE_MISSING");
      add(proposalBlockers, upper(committee?.executionGate) !== "PRONTO_CON_CONFERMA", "COMMITTEE_EXECUTION_GATE_NOT_READY");

      const allProbeBlockers = [...new Set([...globalBlockers, ...probeBlockers])];
      const allProposalBlockers = [...new Set([...globalBlockers, ...proposalBlockers])];

      return {
        symbol,
        rank: finite(candidate?.rank) ? Number(candidate.rank) : null,
        name: candidate?.name ?? symbol,
        currency: currency || null,
        decision: decision || null,
        terminalDecision: terminalDecision || null,
        committeeScore: finite(committeeScore) ? committeeScore : null,
        calibratedConfidence: finite(confidence) ? confidence : null,
        rawConfidence: finite(candidate?.rawConfidenceBeforeCalibration) ? Number(candidate.rawConfidenceBeforeCalibration) : null,
        riskScore: finite(riskScore) ? riskScore : null,
        executionCoverage: {
          paperEligible: rowCoverage?.paperEligible === true,
          independentSourceFamilies: Number.isSafeInteger(sourceFamilies) ? sourceFamilies : 0,
          state: rowCoverage?.state ?? "UNKNOWN",
        },
        gaps: {
          committeeScore: finite(committeeScore) ? Math.max(0, minCommitteeScore - committeeScore) : null,
          calibratedConfidence: finite(confidence) ? Math.max(0, minValidationDataConfidence - confidence) : null,
          riskExcess: finite(riskScore) ? Math.max(0, riskScore - maxRiskScore) : null,
          sourceFamilies: Number.isSafeInteger(sourceFamilies) ? Math.max(0, 2 - sourceFamilies) : null,
        },
        paperProbeEligible: allProbeBlockers.length === 0,
        reviewProposalEligible: allProposalBlockers.length === 0,
        paperProbeBlockers: allProbeBlockers,
        reviewProposalBlockers: allProposalBlockers,
      };
    })
    .sort((a, b) =>
      Number(b.reviewProposalEligible) - Number(a.reviewProposalEligible)
      || Number(b.paperProbeEligible) - Number(a.paperProbeEligible)
      || (b.committeeScore ?? -1) - (a.committeeScore ?? -1)
      || (b.calibratedConfidence ?? -1) - (a.calibratedConfidence ?? -1)
      || (a.rank ?? 9999) - (b.rank ?? 9999)
      || a.symbol.localeCompare(b.symbol));

  return {
    version: 1,
    generatedAt: new Date(now).toISOString(),
    purpose: "Diagnostic bridge from Fenice analysis to a reviewable PAPER proposal. It never stages, transmits or executes an order.",
    safety: {
      diagnosticOnly: true,
      queueWritesAllowed: false,
      paperCertificationEvidenceMutationAllowed: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
      userApprovalStillRequired: true,
    },
    thresholds: {
      minCommitteeScore,
      minValidationDataConfidence,
      maxRiskScore,
      permittedDecisionStates: [...permittedDecisionStates],
      permittedCurrencies: [...permittedCurrencies],
      minimumIndependentPaperSourceFamilies: 2,
    },
    globalBlockers: [...new Set(globalBlockers)],
    candidateCount: rows.length,
    paperProbeReadyCount: rows.filter((row) => row.paperProbeEligible).length,
    reviewProposalReadyCount: rows.filter((row) => row.reviewProposalEligible).length,
    rows,
  };
}
