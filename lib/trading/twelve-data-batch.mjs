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

function parseProviderEpochSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const date = new Date(numeric * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function parseTwelveDataQuoteTime(row) {
  if (!row || typeof row !== "object") {
    return { observedAt: null, paperTimestampVerified: false, source: "missing" };
  }

  // Prefer the most precise provider field when present.
  const lastQuoteAt = parseProviderEpochSeconds(row.last_quote_at);
  if (lastQuoteAt) {
    return {
      observedAt: lastQuoteAt,
      paperTimestampVerified: true,
      source: "last_quote_at",
    };
  }

  // This parser is used only for Twelve Data's /quote batch endpoint. Twelve
  // Data documents /quote as the latest quote and its current 2026 examples
  // expose provider `datetime`/`timestamp` fields for that quote. Our request
  // fixes interval=1min, so even if `timestamp` denotes the current minute bar
  // boundary, the downstream <=120-second freshness gate still fails closed.
  // It is therefore valid provider-originated freshness evidence here; venue,
  // realtime entitlement and provenance checks remain separate requirements.
  const quoteTimestamp = parseProviderEpochSeconds(row.timestamp);
  if (quoteTimestamp) {
    return {
      observedAt: quoteTimestamp,
      paperTimestampVerified: true,
      source: "quote_timestamp_1min",
    };
  }

  return { observedAt: null, paperTimestampVerified: false, source: "missing" };
}
