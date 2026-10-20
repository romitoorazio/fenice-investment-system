// Research-only daily-price provenance for the decision ledger.
// A daily session bucket is not a last-trade timestamp and is NEVER a
// certified PAPER quote or a broker execution price.
const DAY_MS = 86_400_000;
const MAX_RESEARCH_MARK_AGE_MS = 5 * DAY_MS; // weekends/holidays
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function strictUtcMs(value) {
  if (typeof value !== 'string' || !UTC_ISO.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : null;
}

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

export function dailyResearchMark(asset, asOfMs) {
  if (!Number.isSafeInteger(asOfMs)) return null;
  const technical = asset?.technical;
  const price = asset?.price;
  const observedMs = strictUtcMs(technical?.observedAt);
  if (!positive(price) || observedMs === null || observedMs > asOfMs
    || asOfMs - observedMs > MAX_RESEARCH_MARK_AGE_MS
    || technical?.timestampSemantics !== 'DAILY_CANDLE_SESSION_BUCKET_NOT_LAST_TRADE'
    || typeof asset?.symbol !== 'string' || !asset.symbol.trim()
    || !asset.currency || technical.currency !== asset.currency) return null;
  return {
    symbol: asset.symbol.toUpperCase(),
    currency: asset.currency,
    price,
    observedAt: technical.observedAt,
    observedMs,
    evidenceKind: 'DAILY_SESSION_BUCKET_RESEARCH_ONLY',
    executionEligible: false,
  };
}

export function eligibleDecisionCheckpoint(record, mark, days, asOfMs) {
  if (!Number.isInteger(days) || days < 1 || !Number.isSafeInteger(asOfMs)
    || !positive(record?.entryReferencePrice) || !positive(mark?.price)) return false;
  if (typeof record?.currency !== 'string' || !record.currency || record.currency !== mark?.currency) return false;
  const createdMs = strictUtcMs(record?.createdAt);
  const observedMs = strictUtcMs(mark?.observedAt);
  if (createdMs === null || observedMs === null || createdMs > asOfMs
    || observedMs > asOfMs || asOfMs - observedMs > MAX_RESEARCH_MARK_AGE_MS) return false;
  // Require an actual subsequent research session after the full horizon.
  return observedMs >= createdMs + days * DAY_MS;
}

export function eligibleDecisionMark(record, mark, asOfMs) {
  if (!Number.isSafeInteger(asOfMs) || !positive(record?.entryReferencePrice)
    || !positive(mark?.price)) return false;
  if (typeof record?.currency !== 'string' || !record.currency || record.currency !== mark?.currency) return false;
  const createdMs = strictUtcMs(record?.createdAt);
  const observedMs = strictUtcMs(mark?.observedAt);
  return createdMs !== null && observedMs !== null && createdMs <= asOfMs
    && observedMs > createdMs && observedMs <= asOfMs
    && asOfMs - observedMs <= MAX_RESEARCH_MARK_AGE_MS;
}
