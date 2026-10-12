/** Strict normalized UTC timestamp validation, outside the frozen V6 core. */
export function paperTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return null;
  const n = Date.parse(value);
  const canonical = value.includes(".") ? value : value.replace(/Z$/, ".000Z");
  return Number.isFinite(n) && n >= 0 && new Date(n).toISOString() === canonical ? n : null;
}
