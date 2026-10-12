import { parseStooqTimestamp } from "./quality-engine.mjs";

// Public CSV is research-only. A date without a verified trading clock,
// or an old/future quote, must never be promoted to a fresh observation.
export function validateStooqResearchQuote(row, nowMs = Date.now(), maxAgeMs = 96 * 3_600_000) {
  if (!row || typeof row !== "object" || !Number.isFinite(nowMs)
    || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return null;
  const date = String(row.Date || "").trim();
  const time = String(row.Time || "").trim();
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const clock = time.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match || !clock || Number(clock[1]) > 23 || Number(clock[2]) > 59
    || Number(clock[3] || 0) > 59) return null;

  const day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== date) return null;

  const close = Number(row.Close);
  const open = Number(row.Open);
  if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(open) || open <= 0) return null;
  const observedAt = parseStooqTimestamp(date, time);
  if (!observedAt) return null;
  const ageMs = nowMs - Date.parse(observedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeMs) return null;
  return { price: close, open, observedAt };
}

// Provider-level access errors should stop the remaining symbol loop instead
// of sending another 15 free requests to the same throttled service.
export function isStooqProviderAccessFailure(error) {
  return /\bHTTP\s+(403|429|503)\b/i.test(String(error instanceof Error ? error.message : error));
}

// Source-provenance priority comes before research ranking scores.
// Higher speculative research scores do not upgrade a fallback data feed.
export function preferMarketObservation(existing, candidate) {
  if (!existing) return true;
  const fallback = "Stooq public fallback";
  const oldIsFallback = existing.source === fallback;
  const newIsFallback = candidate?.source === fallback;
  if (oldIsFallback !== newIsFallback) return oldIsFallback && Boolean(candidate?.source);
  if (!candidate?.source && existing.source) return false;
  if (candidate?.source && !existing.source) return true;
  if (candidate?.source === existing.source) {
    const currentAt = Date.parse(String(existing.observedAt || ""));
    const nextAt = Date.parse(String(candidate.observedAt || ""));
    if (Number.isFinite(currentAt) && Number.isFinite(nextAt) && currentAt !== nextAt) {
      return nextAt > currentAt;
    }
  }
  return Number(candidate?.score) > Number(existing?.score);
}
