const finite = (value) => Number.isFinite(Number(value));
const upper = (value) => String(value ?? "").trim().toUpperCase();
const asArray = (value) => Array.isArray(value) ? value : [];
const fresh = (timestamp, now, maxAgeMs) => {
  const parsed = Date.parse(String(timestamp ?? ""));
  return Number.isFinite(parsed) && parsed <= now && now - parsed <= maxAgeMs;
};
const add = (blockers, condition, code) => { if (condition) blockers.push(code); };

export function buildV7ProposalReadiness({
  approval,
  committee,
  terminal,
  coverage,
  marketSession,
} = {}, now = Date.now()) {
  if (!Number.isFinite(now)) throw new Error("INVALID_READINESS_CLOCK");

  const sharedGlobalBlockers = [];
  add(sharedGlobalBlockers, approval?.liveTradingAllowed !== false, "LIVE_LOCK_NOT_VERIFIED");
  add(sharedGlobalBlockers, approval?.brokerConnectivityAllowed !== false, "BROKER_LOCK_NOT_VERIFIED");
  add(sharedGlobalBlockers, upper(committee?.sourceGate) !== "GREEN", "COMMITTEE_SOURCE_GATE_NOT_GREEN");
  add(sharedGlobalBlockers, !fresh(committee?.generatedAt, now, 24 * 60 * 60 * 1000), "COMMITTEE_STALE");
  add(sharedGlobalBlockers, !fresh(terminal?.generatedAt, now, 24 * 60 * 60 * 1000), "TERMINAL_STALE");
  add(sharedGlobalBlockers, !finite(terminal?.capitalEuro) || Number(terminal.capitalEuro) <= 0, "TERMINAL_CAPITAL_INVALID");
  add(sharedGlobalBlockers, coverage?.policy?.requiredEligibility !== "PAPER", "COVERAGE_POLICY_NOT_PAPER");
  add(sharedGlobalBlockers, coverage?.policy?.liveTradingAllowed !== false, "COVERAGE_LIVE_LOCK_NOT_VERIFIED");
  add(sharedGlobalBlockers, Number(coverage?.policy?.minIndependentSourceFamilies ?? 0) < 2, "COVERAGE_QUORUM_POLICY_WEAK");
  add(sharedGlobalBlockers, !fresh(coverage?.generatedAt, now, 30 * 60 * 1000), "EXECUTION_COVERAGE_STALE");
  add(sharedGlobalBlockers, marketSession?.configured !== true, "MARKET_SESSION_NOT_CONFIGURED");
  add(sharedGlobalBlockers, marketSession?.liveTradingAllowed !== false, "MARKET_SESSION_LIVE_LOCK_NOT_VERIFIED");
  add(sharedGlobalBlockers, marketSession?.decision?.allowed !== true, "MARKET_SESSION_NOT_OPEN");
  add(sharedGlobalBlockers, !fresh(marketSession?.evidence?.observedAt, now, 60_000), "MARKET_SESSION_STALE");

  const minCommitteeScore = finite(approval?.minCommitteeScore) ? Number(approval.minCommitteeScore) : 70;
  const minValidationDataConfidence = finite(approval?.minValidationDataConfidence) ? Number(approval.minValidationDataConfidence) : 90;
  const maxRiskScore = finite(approval?.maxRiskScore) ? Number(approval.maxRiskScore) : 75;
  const permittedDecisionStates = new Set(asArray(approval?.permittedDecisionStates).map(upper).filter(Boolean));
  const permittedCurrencies = new Set(asArray(approval?.permittedCurrencies).map(upper).filter(Boolean));

  const validationGlobalBlockers = [...sharedGlobalBlockers];
  add(validationGlobalBlockers, approval?.approved !== true || upper(approval?.mode) !== "PAPER", "PAPER_APPROVAL_NOT_ACTIVE");
  const approvalExpiry = Date.parse(String(approval?.expiresAt ?? ""));
  add(validationGlobalBlockers, !Number.isFinite(approvalExpiry) || approvalExpiry <= now, "PAPER_APPROVAL_EXPIRED");
  add(validationGlobalBlockers,
    minCommitteeScore < 0 || minCommitteeScore > 100
      || minValidationDataConfidence < 0 || minValidationDataConfidence > 100
      || maxRiskScore < 0 || maxRiskScore > 100
      || permittedDecisionStates.size === 0 || permittedCurrencies.size === 0,
    "PAPER_APPROVAL_THRESHOLDS_INVALID",
  );

  const coverageBySymbol = new Map(asArray(coverage?.rows).map((row) => [upper(row?.symbol), row]));
  const terminalBySymbol = new Map(asArray(terminal?.assets).map((asset) => [upper(asset?.symbol), asset]));
  const candidates = asArray(committee?.allDecisions).length ? committee.allDecisions : asArray(committee?.topDecisions);

  const rows = candidates
    .filter((candidate) => upper(candidate?.symbol))
    .map((candidate) => {
      const symbol = upper(candidate.symbol);
      const asset = terminalBySymbol.get(symbol);
      const rowCoverage = coverageBySymbol.get(symbol);
      const committeeScore = Number(candidate?.committeeScore);
      const calibratedConfidence = Number(candidate?.confidence);
      const rawCommitteeConfidence = Number(candidate?.rawConfidenceBeforeCalibration ?? candidate?.confidence);
      const terminalConfidence = Number(asset?.confidence);
      const validationDataConfidence = Math.min(rawCommitteeConfidence, terminalConfidence);
      const riskScore = Math.max(Number(candidate?.riskScore ?? 100), Number(asset?.riskScore ?? 100));
      const decision = upper(candidate?.decision);
      const terminalDecision = upper(asset?.decision ?? candidate?.terminalDecision);
      const currency = upper(candidate?.currency ?? asset?.currency);
      const sourceFamilies = Number(rowCoverage?.independentSourceFamilies ?? 0);

      const validationBlockers = [];
      add(validationBlockers, !permittedDecisionStates.has(decision), "DECISION_STATE_NOT_PERMITTED_FOR_V6_PROBE");
      add(validationBlockers, ["ATTENDI", "EVITA"].includes(terminalDecision), "TERMINAL_STATE_BLOCKS_V6_PROBE");
      add(validationBlockers, !finite(committeeScore) || committeeScore < minCommitteeScore, "COMMITTEE_SCORE_BELOW_PAPER_MINIMUM");
      add(validationBlockers, !finite(validationDataConfidence) || validationDataConfidence < minValidationDataConfidence, "RAW_VALIDATION_CONFIDENCE_BELOW_PAPER_MINIMUM");
      add(validationBlockers, !finite(riskScore) || riskScore > maxRiskScore, "RISK_SCORE_ABOVE_PAPER_MAXIMUM");
      add(validationBlockers, !permittedCurrencies.has(currency), "CURRENCY_NOT_PERMITTED_FOR_PAPER");
      add(validationBlockers, rowCoverage?.paperEligible !== true, "PAPER_EXECUTION_COVERAGE_NOT_ELIGIBLE");
      add(validationBlockers, !Number.isSafeInteger(sourceFamilies) || sourceFamilies < 2, "PAPER_SOURCE_QUORUM_NOT_MET");

      const reviewBlockers = [];
      add(reviewBlockers, decision !== "COMPRA", "COMMITTEE_NOT_BUY");
      add(reviewBlockers, terminalDecision !== "ACCUMULA", "TERMINAL_NOT_ACCUMULA");
      add(reviewBlockers, !finite(committeeScore) || committeeScore < minCommitteeScore, "COMMITTEE_SCORE_BELOW_REVIEW_MINIMUM");
      add(reviewBlockers, !finite(calibratedConfidence) || calibratedConfidence < 90, "CALIBRATED_CONFIDENCE_BELOW_REVIEW_MINIMUM");
      add(reviewBlockers, !finite(riskScore) || riskScore > 75, "RISK_SCORE_ABOVE_REVIEW_MAXIMUM");
      add(reviewBlockers, permittedCurrencies.size > 0 && !permittedCurrencies.has(currency), "CURRENCY_NOT_SUPPORTED_BY_CURRENT_PAPER_FX");
      add(reviewBlockers, rowCoverage?.paperEligible !== true, "PAPER_EXECUTION_COVERAGE_NOT_ELIGIBLE");
      add(reviewBlockers, !Number.isSafeInteger(sourceFamilies) || sourceFamilies < 2, "PAPER_SOURCE_QUORUM_NOT_MET");
      add(reviewBlockers, upper(candidate?.entryPlan?.orderMode) !== "LIMITE", "ENTRY_PLAN_NOT_LIMIT");
      add(reviewBlockers, !finite(candidate?.entryPlan?.maxEntryPrice) || Number(candidate.entryPlan.maxEntryPrice) <= 0, "ENTRY_LIMIT_PRICE_MISSING");
      add(reviewBlockers, !finite(candidate?.entryPlan?.firstTrancheEuro) || Number(candidate.entryPlan.firstTrancheEuro) <= 0, "ENTRY_TRANCHE_MISSING");
      add(reviewBlockers, upper(committee?.executionGate) !== "PRONTO_CON_CONFERMA", "COMMITTEE_EXECUTION_GATE_NOT_READY");

      const validationLocalBlockers = [...new Set(validationBlockers)];
      const reviewProposalLocalBlockers = [...new Set(reviewBlockers)];
      const validationCandidateBlockers = [...new Set([...validationGlobalBlockers, ...validationLocalBlockers])];
      const reviewProposalCandidateBlockers = [...new Set([...sharedGlobalBlockers, ...reviewProposalLocalBlockers])];

      return {
        symbol,
        rank: finite(candidate?.rank) ? Number(candidate.rank) : null,
        name: candidate?.name ?? symbol,
        currency: currency || null,
        committeeDecision: decision || null,
        terminalDecision: terminalDecision || null,
        committeeScore: finite(committeeScore) ? committeeScore : null,
        calibratedConfidence: finite(calibratedConfidence) ? calibratedConfidence : null,
        rawCommitteeConfidence: finite(rawCommitteeConfidence) ? rawCommitteeConfidence : null,
        terminalConfidence: finite(terminalConfidence) ? terminalConfidence : null,
        validationDataConfidence: finite(validationDataConfidence) ? validationDataConfidence : null,
        riskScore: finite(riskScore) ? riskScore : null,
        executionCoverage: {
          paperEligible: rowCoverage?.paperEligible === true,
          independentSourceFamilies: Number.isSafeInteger(sourceFamilies) ? sourceFamilies : 0,
          state: rowCoverage?.state ?? "UNKNOWN",
        },
        gaps: {
          committeeScoreToV6Minimum: finite(committeeScore) ? Math.max(0, minCommitteeScore - committeeScore) : null,
          rawValidationConfidenceToV6Minimum: finite(validationDataConfidence) ? Math.max(0, minValidationDataConfidence - validationDataConfidence) : null,
          calibratedConfidenceToReviewMinimum: finite(calibratedConfidence) ? Math.max(0, 90 - calibratedConfidence) : null,
          riskExcessOverV6: finite(riskScore) ? Math.max(0, riskScore - maxRiskScore) : null,
          sourceFamilies: Number.isSafeInteger(sourceFamilies) ? Math.max(0, 2 - sourceFamilies) : null,
        },
        validationStructurallyReady: validationLocalBlockers.length === 0,
        reviewProposalStructurallyReady: reviewProposalLocalBlockers.length === 0,
        validationCandidateReady: validationCandidateBlockers.length === 0,
        reviewProposalCandidateReady: reviewProposalCandidateBlockers.length === 0,
        validationLocalBlockers,
        reviewProposalLocalBlockers,
        validationCandidateBlockers,
        reviewProposalCandidateBlockers,
      };
    })
    .sort((a, b) =>
      Number(b.reviewProposalCandidateReady) - Number(a.reviewProposalCandidateReady)
      || Number(b.validationCandidateReady) - Number(a.validationCandidateReady)
      || (b.committeeScore ?? -1) - (a.committeeScore ?? -1)
      || (b.calibratedConfidence ?? -1) - (a.calibratedConfidence ?? -1)
      || (a.rank ?? 9999) - (b.rank ?? 9999)
      || a.symbol.localeCompare(b.symbol));

  return {
    version: 2,
    generatedAt: new Date(now).toISOString(),
    purpose: "Diagnostic bridge from Fenice analysis to future PAPER review proposals. It does not replace the canonical V6 stager or the final PAPER review re-check.",
    safety: {
      diagnosticOnly: true,
      queueWritesAllowed: false,
      paperCertificationEvidenceMutationAllowed: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
      userApprovalStillRequired: true,
      finalProposalRecheckStillRequired: true,
    },
    semantics: {
      validationStructurallyReady: "Candidate-specific V6 gates pass before time-sensitive global gates are applied. This is diagnostic only.",
      reviewProposalStructurallyReady: "Candidate-specific BUY-review gates pass before time-sensitive global gates are applied. This is diagnostic only.",
      validationCandidateReady: "Candidate-level V6 probe gates plus current global freshness/lock gates pass; canonical stager must still verify campaign budget, OMS state, FX, audit/reconciliation and sizing.",
      reviewProposalCandidateReady: "Candidate plus current global gates are strong enough to shape a local PAPER review proposal; final review route must still re-check fresh evidence, FX, risk, audit and user consent.",
    },
    thresholds: {
      v6: {
        minCommitteeScore,
        minValidationDataConfidence,
        maxRiskScore,
        permittedDecisionStates: [...permittedDecisionStates],
        permittedCurrencies: [...permittedCurrencies],
        minimumIndependentPaperSourceFamilies: 2,
      },
      review: {
        minCommitteeScore,
        minCalibratedConfidence: 90,
        maxRiskScore: 75,
        requiredCommitteeDecision: "COMPRA",
        requiredTerminalDecision: "ACCUMULA",
        requiredOrderMode: "LIMITE",
        minimumIndependentPaperSourceFamilies: 2,
      },
    },
    sharedGlobalBlockers: [...new Set(sharedGlobalBlockers)],
    validationGlobalBlockers: [...new Set(validationGlobalBlockers)],
    candidateCount: rows.length,
    validationStructurallyReadyCount: rows.filter((row) => row.validationStructurallyReady).length,
    reviewProposalStructurallyReadyCount: rows.filter((row) => row.reviewProposalStructurallyReady).length,
    validationCandidateReadyCount: rows.filter((row) => row.validationCandidateReady).length,
    reviewProposalCandidateReadyCount: rows.filter((row) => row.reviewProposalCandidateReady).length,
    rows,
  };
}
