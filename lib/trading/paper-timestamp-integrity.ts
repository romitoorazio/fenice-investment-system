/** Strict normalized UTC timestamp validation, outside the frozen V6 core. */
export function paperTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return null;
  const n = Date.parse(value);
  const canonical = value.includes(".") ? value : value.replace(/Z$/, ".000Z");
  return Number.isFinite(n) && n >= 0 && new Date(n).toISOString() === canonical ? n : null;
}

/** Preserve valid RFC3339 provider offsets/nanoseconds without date coercion. */
export function normalizePaperProviderTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)$/.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const ms = Number((m[7] || "").padEnd(3, "0").slice(0, 3));
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, ms);
  if (year < 1970 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59
    || local.getUTCFullYear() !== year || local.getUTCMonth() + 1 !== month || local.getUTCDate() !== day) return null;
  const offset = m[8];
  const offsetHour = offset === "Z" ? 0 : Number(offset.slice(1, 3));
  const offsetMinute = offset === "Z" ? 0 : Number(offset.slice(4, 6));
  if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  const sign = offset.startsWith("-") ? -1 : 1;
  const utc = local.getTime() - sign * (offsetHour * 60 + offsetMinute) * 60_000;
  return Number.isFinite(utc) && utc >= 0 ? new Date(utc).toISOString() : null;
}
