/**
 * Investment Committee research input contract. The decision clock is explicit:
 * future-dated observations must never receive 'fresh' scoring and zero/missing
 * prices must never create an entry plan. This is separate from PAPER V6 prices.
 */
const MIN_TIME = Date.UTC(2000, 0, 1);
export function scoreResearchFreshness(value, asOfMs) {
  if (!Number.isFinite(asOfMs) || asOfMs < MIN_TIME) throw new Error("INVALID_COMMITTEE_CLOCK");
  if (value === null || value === undefined || value === "") return 35;
  if (typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return 30;
  const observedMs = Date.parse(value);
  if (!Number.isFinite(observedMs) || new Date(observedMs).toISOString().slice(0, 19) !== value.slice(0, 19)
    || observedMs < MIN_TIME) return 30;
  if (observedMs > asOfMs) return 0; // Do not reward impossible future information.
  const hours = (asOfMs - observedMs) / 3_600_000;
  return hours <= 24 ? 100 : hours <= 72 ? 85 : hours <= 168 ? 65 : 35;
}
export function positiveResearchReferencePrice(value) {
  if ((typeof value !== "number" && typeof value !== "string")
    || (typeof value === "string" && value.trim() === "")) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}
