const RECENT_UPSTREAM_CHECK_MS = 15 * 60_000;
const MAX_RESEARCH_AGE_MS = 7 * 86_400_000;

// GDELT is optional research, not broker/quote evidence. If the upstream
// collector has JUST checked it (including a failed attempt), do not probe
// the provider again from the recovery step in the same hourly cycle.
export function shouldAttemptGdeltRecovery(sourceHealth, nowMs = Date.now()) {
  if (!Number.isFinite(nowMs)) return false;
  const row = (Array.isArray(sourceHealth?.sources) ? sourceHealth.sources : [])
    .find(item => item?.id === "gdelt");
  if (!row || !["healthy", "degraded", "failed"].includes(row.status)) return true;
  const checkedAt = Date.parse(String(row.checkedAt || ""));
  if (!Number.isFinite(checkedAt) || checkedAt > nowMs) return false;
  return nowMs - checkedAt > RECENT_UPSTREAM_CHECK_MS;
}

// Provider rate limits and access refusals are not a signal to try another
// endpoint or to increase the request rate.
export function isGdeltProviderBlock(error) {
  return /\bHTTP\s+(403|429|503)\b|too many requests|rate[ -]?limit/i
    .test(String(error instanceof Error ? error.message : error));
}

export function parseGdeltSeenAt(value) {
  const raw = String(value || "").trim();
  if (/^\d{8}T\d{6}Z$/.test(raw)) {
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}.000Z`;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms) || new Date(ms).toISOString() !== iso) return null;
    return iso;
  }
  if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(raw)) {
    const iso = raw.includes(".") ? raw : raw.replace("Z", ".000Z");
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms) || new Date(ms).toISOString() !== iso) return null;
    return iso;
  }
  return null;
}

export function normalizeGdeltResearchArticles(payload, {
  nowMs = Date.now(),
  maxAgeMs = MAX_RESEARCH_AGE_MS,
  limit = 40,
} = {}) {
  if (!payload || !Array.isArray(payload.articles)) {
    throw new Error("GDELT: payload ArtList privo dell'elenco articoli verificabile");
  }
  if (!Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return [];
  const result = [];
  const seenUrls = new Set();
  for (const article of payload.articles) {
    if (result.length >= Math.min(40, Math.max(0, Math.floor(limit)))) break;
    const title = typeof article?.title === "string" ? article.title.trim() : "";
    if (!title || title.length > 400) continue;
    const seenAt = parseGdeltSeenAt(article?.seendate);
    if (!seenAt) continue;
    const age = nowMs - Date.parse(seenAt);
    if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) continue;
    let url;
    try {
      url = new URL(String(article?.url || ""));
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) continue;
    } catch {
      continue;
    }
    // No campaign metrics or execution authority is derived from news.
    const canonicalUrl = url.toString();
    if (seenUrls.has(canonicalUrl)) continue;
    seenUrls.add(canonicalUrl);
    result.push({
      title,
      url: canonicalUrl,
      seendate: seenAt,
      domain: url.hostname.toLowerCase(),
    });
  }
  return result;
}
