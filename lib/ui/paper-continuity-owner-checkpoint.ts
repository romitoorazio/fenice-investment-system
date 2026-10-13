import type { summarizePaperCertificationWindow } from "./paper-certification-window";

/**
 * Owner-facing PAPER V6 continuity CHECKPOINT, not a policy or execution gate.
 * A displayed action cannot renew approval, stage orders, reset a campaign,
 * promote evidence, or unlock a broker. V6 fingerprinted files are untouched.
 */
type PaperCalendar = ReturnType<typeof summarizePaperCertificationWindow>;
type PaperApprovalScope = { maxOrdersPerDay?: number };

export type PaperContinuityCheckpoint = {
  status: "SAFETY_REVIEW_REQUIRED" | "APPROVAL_EXPIRED" | "OWNER_REVIEW_BEFORE_EXPIRY"
    | "CURRENT_APPROVAL_ONLY" | "PASSIVE_EVIDENCE_ONLY" | "NUMERICAL_REVIEW_ONLY";
  message: string;
  expiryAt: string | null;
  earliestMaturityAt: string | null;
  daysUntilExpiry: number | null;
  missingAuthorizedPaperFills: number | null;
  missingVerifiedEvidenceDays: number | null;
  maxOrdersPerDay: number | null;
  illustrativeMinimumDailyProbeWindows: number | null;
  humanDecisionNeededBeforeExpiry: boolean;
  realProfitVerified: false;
  renewedByThisCheck: false;
  newPaperProbesAuthorizedByThisCheck: false;
  paperCertifiedByThisCheck: false;
  brokerOrdersAllowed: false;
  liveTradingAllowed: false;
  diagnosticOnly: true;
};

const validCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const validPositiveCount = (value: unknown): value is number =>
  validCount(value) && value > 0;

export function buildPaperContinuityOwnerCheckpoint(
  calendar: PaperCalendar,
  approval: PaperApprovalScope | null | undefined,
): PaperContinuityCheckpoint {
  const missingFills = validCount(calendar?.missingAuthorizedFills)
    ? calendar.missingAuthorizedFills : null;
  const missingEvidence = validCount(calendar?.missingVerifiedEvidenceDays)
    ? calendar.missingVerifiedEvidenceDays : null;
  const dailyCap = validPositiveCount(approval?.maxOrdersPerDay) && approval.maxOrdersPerDay <= 20
    ? approval.maxOrdersPerDay : null;
  // Informational capacity ONLY, assuming no more than one fill per PAPER order;
  // market sessions, data gates, rejections and fills are not predictable.
  const estimatedDays = missingFills !== null && dailyCap !== null && missingFills > 0
    ? Math.ceil(missingFills / dailyCap) : null;
  const safetyReview = calendar?.state === "INVALID_POLICY"
    || calendar?.evidenceIntegrityReviewRequired === true
    || calendar?.fillCounterHistoryInvalid === true
    || calendar?.fillCounterRegressionDetected === true
    || calendar?.postExpiryFillIncreaseDetected === true;
  let status: PaperContinuityCheckpoint["status"];
  let message: string;
  if (safetyReview) {
    status = "SAFETY_REVIEW_REQUIRED";
    message = "Prove o autorizzazione non coerenti: verificare i registri originali prima di qualsiasi valutazione o nuovo test.";
  } else if (calendar?.numericalTargetsMet === true) {
    status = "NUMERICAL_REVIEW_ONLY";
    message = "I requisiti numerici risultano riportati come raggiunti: serve comunque una verifica indipendente; nessuna certificazione o operatività reale.";
  } else if (calendar?.authorizationExpired === true || calendar?.newProbeWindowOpen !== true) {
    status = "APPROVAL_EXPIRED";
    message = "La finestra dei nuovi test PAPER non è aperta: mantenere i registri e l'osservazione passiva. Nuovi test solo dopo una diversa autorizzazione esplicita e verificata.";
  } else if (missingFills !== null && missingFills > 0
    && calendar?.preExpiryOperatorAttentionRequired === true) {
    status = "OWNER_REVIEW_BEFORE_EXPIRY";
    message = "Prima della scadenza, il proprietario deve rivedere il piano per i fill PAPER mancanti. I test possono avvenire soltanto nei limiti dell'autorizzazione già esistente e con tutti i gate superati.";
  } else if (missingFills === 0) {
    status = "PASSIVE_EVIDENCE_ONLY";
    message = "Il target di fill è riportato come raggiunto: non occorrono fill forzati. Proseguire con prove di integrità e maturazione dei 30 giorni, senza sblocchi automatici.";
  } else {
    status = "CURRENT_APPROVAL_ONLY";
    message = "Verificare i dati della campagna prima di ogni eventuale prova PAPER; il calendario non concede nuove autorizzazioni.";
  }

  return {
    status,
    message,
    expiryAt: calendar?.authorizationExpiresAt ?? null,
    earliestMaturityAt: calendar?.earliestMaturityAt ?? null,
    daysUntilExpiry: validCount(calendar?.daysUntilProbeExpiry) ? calendar.daysUntilProbeExpiry : null,
    missingAuthorizedPaperFills: missingFills,
    missingVerifiedEvidenceDays: missingEvidence,
    maxOrdersPerDay: dailyCap,
    illustrativeMinimumDailyProbeWindows: estimatedDays,
    humanDecisionNeededBeforeExpiry: status === "OWNER_REVIEW_BEFORE_EXPIRY",
    realProfitVerified: false,
    renewedByThisCheck: false,
    newPaperProbesAuthorizedByThisCheck: false,
    paperCertifiedByThisCheck: false,
    brokerOrdersAllowed: false,
    liveTradingAllowed: false,
    diagnosticOnly: true,
  };
}
