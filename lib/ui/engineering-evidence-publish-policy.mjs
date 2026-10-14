/**
 * Publication budget for successful MAIN engineering CI evidence.
 * Never hides a changed code contract, failure, invalid prior proof or
 * long-stale evidence. This only reduces redundant *commits*, not CI checks.
 */
export const ENGINEERING_EVIDENCE_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const sha = x => typeof x === "string" && /^[0-9a-f]{40}$/i.test(x);

export function assessEngineeringEvidencePublication({
  previous, testedSha, now = new Date(), codeChangedSincePrevious,
} = {}) {
  const at = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(at)) return { publish: true, reason: "INVALID_CLOCK" };
  if (!sha(testedSha)) return { publish: true, reason: "INVALID_TESTED_SHA" };
  if (codeChangedSincePrevious !== false) {
    return { publish: true, reason: "CODE_CHANGED_OR_UNVERIFIED" };
  }
  const recordAt = Date.parse(String(previous?.generatedAt || ""));
  const previousSha = previous?.source?.validatedCommit;
  const trusted = previous?.state === "VERIFIED"
    && previous?.source?.conclusion === "success"
    && previous?.source?.branch === "main"
    && sha(previousSha)
    && previous?.policy?.liveTradingAllowed === false
    && previous?.policy?.brokerConnectivityAllowed === false
    && Number.isFinite(recordAt)
    && recordAt > 0
    && recordAt <= at;
  if (!trusted) return { publish: true, reason: "PREVIOUS_EVIDENCE_UNVERIFIED" };
  const ageMs = at - recordAt;
  if (ageMs >= ENGINEERING_EVIDENCE_MIN_INTERVAL_MS) {
    return { publish: true, reason: "EVIDENCE_RENEWAL_DUE" };
  }
  return { publish: false, reason: "RECENT_UNCHANGED_CODE_EVIDENCE", previousSha,
    evidenceAgeMinutes: Math.floor(ageMs / 60_000) };
}
