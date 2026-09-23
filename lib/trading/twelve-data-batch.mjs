export function unwrapTwelveDataBatchQuote(payload, symbol) {
  const wanted = String(symbol || "").trim().toUpperCase();
  if (!wanted || !payload || typeof payload !== "object") return null;

  const normalizeRow = (value) => {
    if (!value || typeof value !== "object") return null;
    if (String(value.status || "").toLowerCase() === "error" || value.code) return null;
    if (value.data && typeof value.data === "object" && !Array.isArray(value.data)) return value.data;
    return value;
  };

  const direct = normalizeRow(payload);
  if (String(direct?.symbol || "").trim().toUpperCase() === wanted) return direct;

  for (const [key, value] of Object.entries(payload)) {
    if (String(key).trim().toUpperCase() !== wanted) continue;
    const row = normalizeRow(value);
    if (row) return row;
  }

  const arrays = [payload.data, payload.values, payload.result].filter(Array.isArray);
  for (const rows of arrays) {
    const row = rows.find((value) => String(value?.symbol || "").trim().toUpperCase() === wanted);
    const normalized = normalizeRow(row);
    if (normalized) return normalized;
  }

  return null;
}

export function parseTwelveDataQuoteTime(row) {
  if (!row || typeof row !== "object") {
    return { observedAt: null, paperTimestampVerified: false, source: "missing" };
  }

  const lastQuoteAt = Number(row.last_quote_at);
  if (Number.isFinite(lastQuoteAt) && lastQuoteAt > 0) {
    return {
      observedAt: new Date(lastQuoteAt * 1000).toISOString(),
      paperTimestampVerified: true,
      source: "last_quote_at",
    };
  }

  // Twelve Data documents `timestamp` on /quote as the opening candle of the
  // requested interval. It remains useful for validation, but it must never be
  // promoted to PAPER freshness when the provider-specific last_quote_at field
  // is absent.
  const candleTimestamp = Number(row.timestamp);
  if (Number.isFinite(candleTimestamp) && candleTimestamp > 0) {
    return {
      observedAt: new Date(candleTimestamp * 1000).toISOString(),
      paperTimestampVerified: false,
      source: "candle_timestamp_validation_only",
    };
  }

  return { observedAt: null, paperTimestampVerified: false, source: "missing" };
}
