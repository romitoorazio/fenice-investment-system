/**
 * Public PAPER proposals are read-only and must never refresh billable feeds.
 * Deny all known refresh aliases, regardless of casing or URL encoding.
 * URLSearchParams decodes percent-encoded names; trimming catches accidental
 * whitespace. Unknown harmless query parameters retain read-only behavior.
 *
 * This is a defensive contract: the public GET must also keep calling the
 * loader WITHOUT refreshLiveContext, even when a query is not recognized.
 * A future interactive refresh needs server-side authentication and a
 * distributed quota/cost budget, not a browser token or in-memory cache.
 */
const PUBLIC_REFRESH_QUERY_KEYS = new Set([
  "fresh",
  "refresh",
  "refreshlivecontext",
  "refresh_live_context",
  "refresh-live-context",
]);

export function isPublicPaperRefreshAttempt(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (PUBLIC_REFRESH_QUERY_KEYS.has(key.trim().toLowerCase())) return true;
  }
  return false;
}
