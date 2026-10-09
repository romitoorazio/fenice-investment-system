export function assessPersistedPaperSession(session, now = Date.now(), maxAgeSeconds = 120) {
  const state = String(session?.evidence?.state || "UNKNOWN").toUpperCase();
  const configured = session?.configured === true;
  const authoritative = session?.evidence?.authoritative === true;
  const allowed = session?.decision?.allowed === true;
  const parsedObservedAt = Date.parse(String(session?.evidence?.observedAt || ""));
  const parsedGeneratedAt = Date.parse(String(session?.generatedAt || ""));
  const ageSeconds = Number.isFinite(parsedObservedAt) ? (now - parsedObservedAt) / 1000 : Number.POSITIVE_INFINITY;
  const generationAgeSeconds = Number.isFinite(parsedGeneratedAt) ? (now - parsedGeneratedAt) / 1000 : Number.POSITIVE_INFINITY;
  const originalAge = session?.decision?.ageSeconds;
  const reportedAgeValid = typeof originalAge === "number" && Number.isFinite(originalAge) && originalAge >= 0 && originalAge <= maxAgeSeconds;
  const validAge = (age) => Number.isFinite(age) && age >= -5 && age <= maxAgeSeconds;
  const fresh = validAge(ageSeconds) && validAge(generationAgeSeconds) && reportedAgeValid;
  const consistentDecision = (state === "OPEN" && allowed) || (state === "CLOSED" && !allowed);
  const reliable = configured && authoritative && fresh && consistentDecision;
  const reasons = Array.isArray(session?.decision?.reasons) ? [...session.decision.reasons] : [];
  if (!fresh) reasons.push("persisted market-session timestamp is missing, stale or future-dated");
  if (!consistentDecision) reasons.push("persisted market-session state and allow decision disagree");
  if (!configured || !authoritative) reasons.push("persisted market-session source is not authoritative");
  const safeAge = (age) => Number.isFinite(age) ? Number(age.toFixed(3)) : 999999;
  return {
    state, configured, authoritative, allowed, fresh, reliable,
    marketOpen: reliable && state === "OPEN",
    marketClosed: reliable && state === "CLOSED",
    ageSeconds: safeAge(ageSeconds),
    generationAgeSeconds: safeAge(generationAgeSeconds),
    reasons: [...new Set(reasons)],
  };
}
