export type ExecutionEvidenceSnapshot = {
  version?: number;
  generatedAt?: string | null;
  observations?: Array<{
    sourceFamily?: string;
    eligibility?: string;
    provenanceVerified?: boolean;
  }>;
  capabilities?: {
    twelveDataConfigured?: boolean;
    alpacaConfigured?: boolean;
    alphaVantageConfigured?: boolean;
    directaLocalSnapshotDetected?: boolean;
    directaPaperFreshObservations?: number;
  };
  policy?: {
    liveTradingAllowed?: boolean;
    validationOnlySourcesNeverSatisfyPaperQuorum?: boolean;
    untaggedLegacyEvidenceDefaultsToValidationOnly?: boolean;
    paperEligibilityRequiresVerifiedProvenance?: boolean;
  };
};

export type ExecutionCoverageSnapshot = {
  version?: number;
  generatedAt?: string | null;
  evidenceGeneratedAt?: string | null;
  requestedSymbols?: number;
  paperEligibleSymbols?: number;
  paperEligiblePercent?: number;
  policy?: {
    requiredEligibility?: string;
    minIndependentSourceFamilies?: number;
    preferredIndependentSourceFamilies?: number;
    directaPaidRealtimeRequired?: boolean;
    directaEvidenceOptionalForPaperCertification?: boolean;
    validationOnlyEvidenceCannotSatisfyPaperQuorum?: boolean;
    paperEligibilityRequiresVerifiedProvenance?: boolean;
    liveTradingAllowed?: boolean;
    approvedIndependentPaperSourceFamilies?: string[];
    preferredZeroCostPaperSourceFamilies?: string[];
  };
};

export type ExecutionReadinessState = "PASS" | "BLOCKED" | "STALE" | "UNCONFIGURED";

export type ExecutionReadinessResult = {
  verified: boolean;
  state: ExecutionReadinessState;
  reasons: string[];
  ownerActionRequired: boolean;
  ownerAction: string | null;
  metrics: {
    evidenceAgeMinutes: number | null;
    coverageAgeMinutes: number | null;
    coverageMatchesEvidence: boolean;
    paperEligibleSourceFamilies: number;
    configuredZeroCostSourceFamilies: number;
    configuredZeroCostSources: string[];
    requestedSymbols: number;
    paperEligibleSymbols: number;
    paperEligiblePercent: number;
    unverifiedPaperObservations: number;
    executionEvidenceVersion: number;
    executionCoverageVersion: number;
    directaPaidRealtimeRequired: boolean;
    directaEvidenceOptionalForPaperCertification: boolean;
    liveTradingAllowed: false;
  };
};

const MAX_EXECUTION_AGE_MINUTES = 30;
const MIN_PAPER_SYMBOLS = 3;
const MIN_PAPER_PERCENT = 25;
const MIN_SOURCE_FAMILIES = 2;

function timestampMs(value: unknown): number | null {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function ageMinutes(value: unknown, nowMs: number): number | null {
  const parsed = timestampMs(value);
  if (parsed === null) return null;
  return (nowMs - parsed) / 60_000;
}

function isFresh(age: number | null): boolean {
  return age !== null && age >= 0 && age <= MAX_EXECUTION_AGE_MINUTES;
}

function normalizedFamilies(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : [];
}

/**
 * Derive the runtime PAPER execution gate from persisted repository evidence.
 * This helper is deliberately fail-closed: stale, legacy, unverified or
 * mismatched evidence cannot become a PASS. It does not authorize live trading.
 */
export function evaluateExecutionReadiness(
  evidence: ExecutionEvidenceSnapshot | null | undefined,
  coverage: ExecutionCoverageSnapshot | null | undefined,
  now = Date.now(),
): ExecutionReadinessResult {
  const nowMs = Number(now);
  const evidenceAgeMinutes = ageMinutes(evidence?.generatedAt, nowMs);
  const coverageAgeMinutes = ageMinutes(coverage?.generatedAt, nowMs);
  const evidenceAt = timestampMs(evidence?.generatedAt);
  const coverageEvidenceAt = timestampMs(coverage?.evidenceGeneratedAt);
  const coverageMatchesEvidence = evidenceAt !== null
    && coverageEvidenceAt !== null
    && Math.abs(evidenceAt - coverageEvidenceAt) <= 1000;

  const observations = Array.isArray(evidence?.observations) ? evidence.observations : [];
  const verifiedPaperObservations = observations.filter((row) =>
    (row?.eligibility === "PAPER" || row?.eligibility === "LIVE")
      && row?.provenanceVerified === true,
  );
  const unverifiedPaperObservations = observations.filter((row) =>
    (row?.eligibility === "PAPER" || row?.eligibility === "LIVE")
      && row?.provenanceVerified !== true,
  ).length;
  const paperFamilies = new Set(
    verifiedPaperObservations
      .map((row) => String(row?.sourceFamily || "").trim().toLowerCase())
      .filter(Boolean),
  );

  const configuredZeroCostSources = [
    evidence?.capabilities?.twelveDataConfigured === true ? "twelve-data" : null,
    evidence?.capabilities?.alpacaConfigured === true ? "alpaca" : null,
  ].filter((value): value is string => Boolean(value));

  const approvedFamilies = normalizedFamilies(coverage?.policy?.approvedIndependentPaperSourceFamilies);
  const preferredZeroCostFamilies = normalizedFamilies(coverage?.policy?.preferredZeroCostPaperSourceFamilies);
  const evidenceSchemaReady = Number(evidence?.version || 0) >= 10;
  const coverageSchemaReady = Number(coverage?.version || 0) >= 6;
  const evidencePolicyReady = evidence?.policy?.liveTradingAllowed === false
    && evidence?.policy?.validationOnlySourcesNeverSatisfyPaperQuorum === true
    && evidence?.policy?.untaggedLegacyEvidenceDefaultsToValidationOnly === true
    && evidence?.policy?.paperEligibilityRequiresVerifiedProvenance === true;
  const coveragePolicyReady = coverage?.policy?.requiredEligibility === "PAPER"
    && Number(coverage?.policy?.minIndependentSourceFamilies || 0) >= MIN_SOURCE_FAMILIES
    && Number(coverage?.policy?.preferredIndependentSourceFamilies || 0) >= 3
    && coverage?.policy?.directaPaidRealtimeRequired === false
    && coverage?.policy?.directaEvidenceOptionalForPaperCertification === true
    && coverage?.policy?.validationOnlyEvidenceCannotSatisfyPaperQuorum === true
    && coverage?.policy?.paperEligibilityRequiresVerifiedProvenance === true
    && approvedFamilies.length >= MIN_SOURCE_FAMILIES
    && preferredZeroCostFamilies.includes("twelve-data")
    && preferredZeroCostFamilies.includes("alpaca")
    && coverage?.policy?.liveTradingAllowed === false;

  const requestedSymbols = Math.max(0, Number(coverage?.requestedSymbols || 0));
  const paperEligibleSymbols = Math.max(0, Number(coverage?.paperEligibleSymbols || 0));
  const paperEligiblePercent = Math.max(0, Number(coverage?.paperEligiblePercent || 0));
  const broadCoverageReady = requestedSymbols >= MIN_PAPER_SYMBOLS
    && paperEligibleSymbols >= MIN_PAPER_SYMBOLS
    && paperEligiblePercent >= MIN_PAPER_PERCENT;
  const freshnessReady = isFresh(evidenceAgeMinutes) && isFresh(coverageAgeMinutes);
  const sourceRedundancyReady = paperFamilies.size >= MIN_SOURCE_FAMILIES;
  const provenanceReady = unverifiedPaperObservations === 0;

  const reasons: string[] = [];
  if (!freshnessReady) reasons.push("execution evidence is missing or older than 30 minutes");
  if (!coverageMatchesEvidence) reasons.push("execution coverage does not match the evidence snapshot");
  if (!evidenceSchemaReady || !coverageSchemaReady) reasons.push("execution evidence schema is legacy or incomplete");
  if (!evidencePolicyReady || !coveragePolicyReady) reasons.push("provider-neutral PAPER safety policy is not fully enforced");
  if (!provenanceReady) reasons.push(`${unverifiedPaperObservations} PAPER/LIVE observation(s) lack verified provenance`);
  if (!sourceRedundancyReady) reasons.push(`verified PAPER source redundancy is ${paperFamilies.size}/${MIN_SOURCE_FAMILIES}`);
  if (!broadCoverageReady) reasons.push(`PAPER symbol coverage is ${paperEligibleSymbols}/${requestedSymbols} (${paperEligiblePercent}%)`);

  const verified = freshnessReady
    && coverageMatchesEvidence
    && evidenceSchemaReady
    && coverageSchemaReady
    && evidencePolicyReady
    && coveragePolicyReady
    && provenanceReady
    && sourceRedundancyReady
    && broadCoverageReady;

  const missingZeroCostCredentials = freshnessReady
    && configuredZeroCostSources.length < MIN_SOURCE_FAMILIES
    && paperFamilies.size < MIN_SOURCE_FAMILIES;
  const ownerActionRequired = !verified && missingZeroCostCredentials;
  const ownerAction = ownerActionRequired
    ? "Configurare credenziali gratuite per almeno due fonti PAPER indipendenti. Percorso preferito: Twelve Data Basic + Alpaca Basic/IEX. Non serve attivare il feed realtime Directa a pagamento."
    : null;

  let state: ExecutionReadinessState = "BLOCKED";
  if (verified) state = "PASS";
  else if (!freshnessReady) state = "STALE";
  else if (ownerActionRequired) state = "UNCONFIGURED";

  return {
    verified,
    state,
    reasons,
    ownerActionRequired,
    ownerAction,
    metrics: {
      evidenceAgeMinutes: evidenceAgeMinutes === null ? null : Number(evidenceAgeMinutes.toFixed(1)),
      coverageAgeMinutes: coverageAgeMinutes === null ? null : Number(coverageAgeMinutes.toFixed(1)),
      coverageMatchesEvidence,
      paperEligibleSourceFamilies: paperFamilies.size,
      configuredZeroCostSourceFamilies: configuredZeroCostSources.length,
      configuredZeroCostSources,
      requestedSymbols,
      paperEligibleSymbols,
      paperEligiblePercent,
      unverifiedPaperObservations,
      executionEvidenceVersion: Number(evidence?.version || 0),
      executionCoverageVersion: Number(coverage?.version || 0),
      directaPaidRealtimeRequired: coverage?.policy?.directaPaidRealtimeRequired === true,
      directaEvidenceOptionalForPaperCertification: coverage?.policy?.directaEvidenceOptionalForPaperCertification === true,
      liveTradingAllowed: false,
    },
  };
}
