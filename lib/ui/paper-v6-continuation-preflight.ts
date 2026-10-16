import { summarizePaperCertificationWindow } from "./paper-certification-window.ts";

type CalendarCampaign = Parameters<typeof summarizePaperCertificationWindow>[0];
type CalendarApproval = Parameters<typeof summarizePaperCertificationWindow>[1];

type ContinuationPlan = {
  schemaVersion?: number; purpose?: string; phase?: string;
  v6?: {
    baselineCommit?: string; baselineDigest?: string; startedAt?: string;
    originalApprovalId?: string; originalExpiresAt?: string;
    requiredDurationDays?: number; minimumEvidenceDays?: number; minimumPaperFills?: number;
  };
  unchangedApprovalLimits?: Record<string, unknown>;
  absoluteRestrictions?: Record<string, unknown>;
  contingency?: Record<string, unknown>;
  historicalCheckpoint?: {
    asOfUtcDate?: string; minimumReportedEvidenceDays?: number;
    minimumReportedPaperFills?: number; minimumLedgerExecutions?: number;
    minimumAuditEntries?: number; sourceCommit?: string;
  };
};
type Approval = CalendarApproval & Record<string, unknown>;
type Campaign = CalendarCampaign & {
  baselineCommit?: string; version?: number; liveTradingAllowed?: boolean;
  baselineFingerprint?: { digest?: string; complete?: boolean; algorithm?: string };
};
type Ledger = {
  mode?: string; liveTradingAllowed?: boolean; brokerConnectivityAllowed?: boolean;
  executions?: Array<{status?: string}>;
  reconciliation?: { balanced?: boolean; breaks?: unknown[] };
  auditChain?: unknown[];
};
type Queue = { mode?: string; orders?: unknown[] };
type Fingerprint = {complete?: boolean; digest?: string; algorithm?: string; version?: number};

const numberFields = [
  "targetPaperFills", "maxProbeAttemptsTotal", "maxOrdersPerDay",
  "maxNotionalEuroPerOrder", "maxCapitalPercentPerProbe",
  "minTcaProbeNotionalEuro", "maxSingleAssetWeightPercentForProbe",
  "minCommitteeScore", "minValidationDataConfidence", "maxRiskScore",
] as const;
const arrayFields = ["permittedDecisionStates","permittedCurrencies"] as const;
const fixedFalse = [
  "liveTradingAllowed", "brokerConnectivityAllowed", "mayRenewV6Approval",
  "mayChangeV6Fingerprint", "mayStageNewProbesAfterOriginalExpiry",
  "mayBackdateEvidence", "mayCountOldFillsAsNewPhaseFills",
  "mayModifyBrokerOrPAPERExecution",
] as const;

export function assessPaperV6ContinuationPreparation({
  plan, campaign, approval, ledger, queue, fingerprint, now = Date.now(),
}:{
  plan:ContinuationPlan|null|undefined; campaign:Campaign|null|undefined;
  approval:Approval|null|undefined; ledger:Ledger|null|undefined;
  queue:Queue|null|undefined; fingerprint:Fingerprint|null|undefined; now?:number;
}) {
  const blockers:string[] = [];
  const requireMatch = (condition:boolean, code:string) => {
    if (!condition) blockers.push(code);
  };
  const original = plan?.v6;
  const limits = plan?.unchangedApprovalLimits ?? {};
  const historic = plan?.historicalCheckpoint;
  const restrictions = plan?.absoluteRestrictions ?? {};
  const validClock = Number.isSafeInteger(now) && now >= 0;
  requireMatch(validClock, "CLOCK_INVALID");
  requireMatch(plan?.schemaVersion === 1
    && plan?.purpose === "PREPARE_PAPER_V6_CONTINUATION_ONLY"
    && plan?.phase === "PREPARATION_NOT_EXECUTION", "PREPARATION_SCOPE_INVALID");
  requireMatch(fixedFalse.every(k => restrictions[k] === false), "RESTRICTIONS_NOT_ALL_FALSE");
  requireMatch(original?.baselineCommit === campaign?.baselineCommit
    && typeof original?.baselineCommit === "string"
    && /^[a-f0-9]{40}$/.test(original.baselineCommit), "V6_BASELINE_COMMIT_CHANGED");
  requireMatch(campaign?.version === 6 && campaign?.startedAt === original?.startedAt
    && campaign?.requiredDays === original?.requiredDurationDays
    && campaign?.minEvidenceDays === original?.minimumEvidenceDays
    && campaign?.minPaperFills === original?.minimumPaperFills,
  "CAMPAIGN_TARGETS_OR_START_CHANGED");
  const digest = original?.baselineDigest;
  requireMatch(typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest)
    && digest === campaign?.baselineFingerprint?.digest
    && campaign?.baselineFingerprint?.complete === true
    && campaign?.baselineFingerprint?.algorithm === "sha256"
    && fingerprint?.complete === true
    && fingerprint?.algorithm === "sha256"
    && fingerprint?.version === 1
    && fingerprint?.digest === digest, "V6_FINGERPRINT_DIFFERENCE");
  requireMatch(approval?.approvalId === original?.originalApprovalId
    && approval?.expiresAt === original?.originalExpiresAt
    && approval?.approved === true && approval?.humanConfirmation === true
    && approval?.mode === "PAPER", "ORIGINAL_APPROVAL_CHANGED");
  requireMatch(approval?.liveTradingAllowed === false
    && approval?.brokerConnectivityAllowed === false
    && campaign?.liveTradingAllowed === false
    && ledger?.mode === "PAPER"
    && ledger?.liveTradingAllowed === false
    && ledger?.brokerConnectivityAllowed === false
    && queue?.mode === "PAPER", "LIVE_OR_BROKER_SAFETY_INVALID");
  requireMatch(numberFields.every(k => typeof limits[k] === "number"
    && approval?.[k] === limits[k]), "ORIGINAL_NUMERIC_LIMITS_CHANGED");
  requireMatch(limits.idPrefix === approval?.idPrefix
    && typeof limits.idPrefix === "string", "V6_PROBE_PREFIX_CHANGED");
  requireMatch(arrayFields.every(k => JSON.stringify(limits[k]) === JSON.stringify(approval?.[k])),
    "ORIGINAL_ALLOWED_SET_CHANGED");
  requireMatch(JSON.stringify(limits.fxPolicy) === JSON.stringify(approval?.fxPolicy),
    "ORIGINAL_FX_POLICY_CHANGED");
  requireMatch(plan?.contingency?.phaseBExpiry === "NOT_SPECIFIED_NO_NEW_PROBE_AUTHORITY"
    && plan?.contingency?.preserveOriginalV6Evidence === "READ_ONLY_WITH_BASELINE_DIGEST_AND_AUDIT_PROOF",
    "PHASE_B_NOT_SAFE_TO_PREPARE");
  requireMatch(Array.isArray(ledger?.executions)
    && Array.isArray(queue?.orders)
    && ledger?.reconciliation?.balanced === true
    && Array.isArray(ledger?.reconciliation?.breaks)
    && ledger.reconciliation.breaks.length === 0, "LEDGER_OR_QUEUE_UNVERIFIABLE");

  const calendar = summarizePaperCertificationWindow(campaign, approval, now);
  const filled = Array.isArray(ledger?.executions)
    ? ledger.executions.filter(x => x?.status === "PAPER_FILLED").length : null;
  requireMatch(calendar?.approvalValid === true && calendar?.state !== "INVALID_POLICY",
    "CALENDAR_APPROVAL_INVALID");
  requireMatch(calendar?.evidenceIntegrityReviewRequired === false
    && calendar?.fillCounterHistoryInvalid === false
    && calendar?.fillCounterRegressionDetected === false
    && calendar?.postExpiryFillIncreaseDetected === false, "HISTORICAL_EVIDENCE_REVIEW_REQUIRED");
  requireMatch(filled !== null && filled === calendar.reportedFills,
    "REPORTED_FILLS_LEDGER_MISMATCH");
  // The preparation snapshot is a monotone lower bound, not an invented
  // certified count. Losing past evidence may never appear as a clean renewal.
  requireMatch(historic?.asOfUtcDate === "2026-10-16"
    && typeof historic?.sourceCommit === "string"
    && /^[a-f0-9]{40}$/.test(historic.sourceCommit)
    && historic?.minimumReportedEvidenceDays === 22
    && historic?.minimumReportedPaperFills === 7
    && historic?.minimumLedgerExecutions === 9
    && historic?.minimumAuditEntries === 9
    && calendar.evidenceDays >= historic.minimumReportedEvidenceDays
    && calendar.reportedFills >= historic.minimumReportedPaperFills
    && Array.isArray(ledger?.executions)
    && ledger.executions.length >= historic.minimumLedgerExecutions
    && Array.isArray(ledger?.auditChain)
    && ledger.auditChain.length >= historic.minimumAuditEntries,
    "HISTORICAL_V6_CHECKPOINT_REGRESSION");
  const expired = calendar.authorizationExpired === true;
  requireMatch(!expired || (Array.isArray(queue?.orders) && queue.orders.length === 0),
    "POST_EXPIRY_PENDING_ORDERS_REQUIRE_QUARANTINE");

  let status = "BLOCKED_INTEGRITY_REVIEW";
  if (blockers.length === 0) {
    if (calendar.numericalTargetsMet) status = "NUMERICAL_REVIEW_ONLY";
    else if (expired && (calendar.missingAuthorizedFills ?? 0) > 0)
      status = "SEPARATE_PHASE_B_REQUIRED";
    else if (expired || (calendar.missingAuthorizedFills ?? 0) === 0)
      status = "PASSIVE_CONTINUATION_ONLY";
    else status = "ORIGINAL_V6_APPROVAL_ONLY";
  }
  return {
    status, reasons:[...new Set(blockers)], checkedAt: validClock ? new Date(now).toISOString() : null,
    originalApprovalExpiresAt: original?.originalExpiresAt ?? null,
    originalMaturityAt: calendar.earliestMaturityAt,
    evidenceDaysVerified: calendar.verifiedEvidenceDays,
    carriedHistoricalFills: calendar.reportedFills,
    originalApprovalFills: calendar.authorizedReportedFills,
    remainingOriginalFillTarget: calendar.missingAuthorizedFills,
    originalBaselineFingerprintMatches: !blockers.includes("V6_FINGERPRINT_DIFFERENCE"),
    isSafeToPreserveHistoricalEvidence: blockers.length === 0,
    // This record is permission to PREPARE a safe procedure, never permission to submit.
    preparatoryOwnerInstructionRecorded: plan?.purpose === "PREPARE_PAPER_V6_CONTINUATION_ONLY",
    authorizationToRenewOriginalV6: false as const,
    authorizationToStageNewProbesFromPlan: false as const,
    postExpiryProbeAllowedFromPlan: false as const,
    brokerOrderSubmissionAllowed: false as const,
    liveTradingAllowed: false as const,
    v6HistoricalFillsAreNewBaselineFills: false as const,
  };
}
