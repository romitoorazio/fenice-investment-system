/**
 * Research-only diagnostic of stored PAPER market evidence and historical
 * rejections. Does not query a provider, certify quotes, place orders or touch V6.
 */
type Quote = { sourceFamily?: string; eligibility?: string; observedAt?: string;
  provenanceVerified?: boolean; symbol?: string };
type Evidence = { generatedAt?: string; observations?: Quote[] };
type Coverage = { generatedAt?: string; evidenceGeneratedAt?: string | null; requestedSymbols?: number; paperEligibleSymbols?: number };
type Execution = { symbol?: string; status?: string; createdAt?: string;
  risk?: { reasons?: string[]; checks?: Array<{code?: string; passed?: boolean}> } };
type Oms = { executions?: Execution[]; killSwitch?: {engaged?: boolean} };

const timestamp = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0,19) === value.slice(0,19) ? ms : null;
};
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
export function diagnosePaperEvidenceBottlenecks(
  evidence: Evidence | null | undefined,
  coverage: Coverage | null | undefined,
  oms: Oms | null | undefined,
  now: number = Date.now(),
) {
  const at = timestamp(evidence?.generatedAt);
  const coverageAt = timestamp(coverage?.generatedAt);
  const coverageEvidenceAt = timestamp(coverage?.evidenceGeneratedAt);
  const coverageCountsValid = typeof coverage?.requestedSymbols === "number"
    && Number.isSafeInteger(coverage.requestedSymbols) && coverage.requestedSymbols > 0
    && typeof coverage.paperEligibleSymbols === "number"
    && Number.isSafeInteger(coverage.paperEligibleSymbols) && coverage.paperEligibleSymbols >= 0
    && coverage.paperEligibleSymbols <= coverage.requestedSymbols;
  // This is only a diagnostic. The execution gate has its own stricter
  // proof checks, and no stored row ever becomes live trading authority.
  // Proximity of generatedAt values is not proof that coverage was derived
  // from THIS quote batch. Require the coverage report's exact source timestamp.
  // Missing or mismatched provenance fails closed in the UI diagnostic.
  const coverageEvidenceAligned = at !== null && coverageAt !== null
    && coverageEvidenceAt !== null && coverageEvidenceAt === at
    && coverageAt >= at && coverageAt - at <= 120_000;
  const runtimeSnapshotFresh = Number.isSafeInteger(now) && now >= 0
    && coverageEvidenceAligned && coverageCountsValid && coverageAt! <= now
    && at! <= now && now - at! <= 120_000 && now - coverageAt! <= 120_000;
  const observations = Array.isArray(evidence?.observations) ? evidence.observations : [];
  const byFamily = (family: string) => {
    const quotes = observations.filter(q => q?.sourceFamily === family);
    return {
      paperAtCollection: quotes.filter(q => q.eligibility === "PAPER"
        && q.provenanceVerified === true
        && timestamp(q.observedAt) !== null
        && at !== null && (timestamp(q.observedAt) as number) <= at
        && at - (timestamp(q.observedAt) as number) <= 120_000).length,
      staleAtCollection: quotes.filter(q => {
        const qt = timestamp(q.observedAt);
        return at !== null && qt !== null && qt <= at && at - qt > 120_000;
      }).length,
      validationOnly: quotes.filter(q => q.eligibility === "VALIDATION_ONLY").length,
    };
  };
  const rejections = (Array.isArray(oms?.executions) ? oms.executions : [])
    .filter(x => x.status === "RISK_REJECTED")
    .sort((a,b) => (timestamp(b.createdAt) ?? 0) - (timestamp(a.createdAt) ?? 0));
  const latest = rejections[0];
  const failureCodes = latest?.risk?.checks?.filter(c => c.passed === false)
    .map(c => c.code).filter((c): c is string => typeof c === "string" && c.length > 0) ?? [];
  const reasons = Array.isArray(latest?.risk?.reasons)
    ? latest.risk.reasons.filter((r): r is string => typeof r === "string").slice(0,4)
    : [];
  return {
    diagnosticOnly: true as const,
    paperCertificationEligible: false as const,
    brokerSubmissionAllowed: false as const,
    liveTradingAllowed: false as const,
    snapshotAt: at === null ? null : new Date(at).toISOString(),
    coverageSnapshotAt: coverageAt === null ? null : new Date(coverageAt).toISOString(),
    coverageEvidenceAligned,
    runtimeSnapshotFresh,
    requestedSymbols: count(coverage?.requestedSymbols),
    paperEligibleSymbols: count(coverage?.paperEligibleSymbols), // historical count only
    currentPaperEligibleSymbols: runtimeSnapshotFresh ? coverage!.paperEligibleSymbols! : null,
    sources: { alpaca: byFamily("alpaca"), "twelve-data": byFamily("twelve-data") },
    lastRiskRejection: latest ? {
      symbol: String(latest.symbol || "").slice(0,25),
      createdAt: timestamp(latest.createdAt) === null ? null : latest.createdAt!,
      reasons: reasons.length ? reasons : failureCodes,
    } : null,
    currentKillSwitchEngaged: typeof oms?.killSwitch?.engaged === "boolean" ? oms.killSwitch.engaged : null,
  };
}
