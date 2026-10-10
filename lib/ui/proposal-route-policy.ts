/**
 * Public proposal reads cannot spend provider API quota.
 * Every refresh query (even fresh=0 or duplicated) is rejected fail-closed.
 * An authenticated, budgeted server-side action is required before this
 * capability can ever be re-enabled; a browser-only check is insufficient.
 */
export function isPublicPaperRefreshAttempt(url: URL): boolean {
  return url.searchParams.has("fresh");
}
