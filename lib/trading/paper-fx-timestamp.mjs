/** Reject impossible future provider timestamps; do not manufacture freshness. */
export function validateFxTimestamp(timestampSeconds, nowMs = Date.now(), maxAgeSeconds = 120, futureToleranceSeconds = 5) {
  const timestamp = Number(timestampSeconds);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return { valid: false, reason: "INVALID_TIMESTAMP", ageSeconds: null };
  const ageSeconds = (nowMs - timestamp * 1000) / 1000;
  if (ageSeconds < -futureToleranceSeconds) return { valid: false, reason: "FUTURE_TIMESTAMP", ageSeconds };
  if (ageSeconds > maxAgeSeconds) return { valid: false, reason: "STALE_TIMESTAMP", ageSeconds };
  return { valid: true, reason: null, ageSeconds: Math.max(0, ageSeconds) };
}
