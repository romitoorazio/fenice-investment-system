/**
 * Missing DCF does not mean zero. Number(null) and Number("") produce 0,
 * which fabricates valuations or prevents valid research entry caps.
 * Research-only helper; never authorizes execution.
 */
export function optionalDcfNumber(value, { positiveOnly = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (positiveOnly && value <= 0) return null;
  return value;
}
