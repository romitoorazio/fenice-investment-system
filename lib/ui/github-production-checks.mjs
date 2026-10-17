// Diagnostic-only GitHub Actions evidence for the exact Vercel commit.
// Fixed GitHub origin + validated SHA; no credentials, PR user URLs or broker calls.
export const REQUIRED_FENICE_CHECKS = Object.freeze([
  "quality", "protect-paper-core", "paper-evidence-state",
  "terminal-research-safety", "continuity-safety",
  "global-market-session-safety", "no-auto-renewal", "offline-contract",
]);

const isSha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const timestamp = value => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === value.slice(0, 19) ? ms : null;
};
const result = (state, commit, passed = [], failed = []) => ({
  state, commit: isSha(commit) ? commit : null,
  verified: state === "EXACT_SHA_CHECKS_VERIFIED",
  source: "GitHub Actions public check-runs, same commit",
  requiredChecks: [...REQUIRED_FENICE_CHECKS],
  passedChecks: passed, failedChecks: failed,
  authorizesPaper: false, authorizesLive: false, brokerSubmissionAllowed: false,
  // An exact GitHub CI check does not verify the Vercel alias, code in a
  // logged-in browser or any execution/financial readiness.
  verifiesVercelAlias: false, certifiesEconomicPerformance: false,
});

export function assessGitHubProductionChecks(payload, commit, nowMs = Date.now()) {
  if (!isSha(commit) || !Number.isFinite(nowMs) || nowMs < 946684800000)
    return result("INVALID_SHA_OR_CLOCK", commit);
  const rows = payload?.check_runs;
  if (!Array.isArray(rows) || rows.length > 100 || !Number.isSafeInteger(payload.total_count) ||
      payload.total_count < rows.length || payload.total_count > 100)
    return result("GITHUB_CHECKS_INCOMPLETE", commit);
  const latest = new Map();
  for (const row of rows) {
    if (row?.head_sha !== commit || row?.app?.slug !== "github-actions" ||
        !REQUIRED_FENICE_CHECKS.includes(row.name) || !Number.isSafeInteger(row.id))
      continue;
    const at = timestamp(row.completed_at || row.started_at);
    if (at === null || at > nowMs + 30_000) continue;
    const current = latest.get(row.name);
    if (!current || at > current.at || (at === current.at && row.id > current.id))
      latest.set(row.name, { at, id: row.id, row });
  }
  const passed = [], failed = [];
  for (const name of REQUIRED_FENICE_CHECKS) {
    const row = latest.get(name)?.row;
    if (row?.status === "completed" && row.conclusion === "success") passed.push(name);
    else failed.push(name);
  }
  return result(failed.length ? "EXACT_SHA_CHECKS_NOT_GREEN" : "EXACT_SHA_CHECKS_VERIFIED",
    commit, passed, failed);
}

export async function readGitHubProductionChecks({
  commit, environment, nowMs = Date.now(), fetcher = fetch,
} = {}) {
  if (environment !== "production" || !isSha(commit) || !Number.isFinite(nowMs))
    return result("DEPLOYMENT_METADATA_UNAVAILABLE", commit);
  // Public REST only: no token or secret forwarded, and bounded TTL/timeout.
  const url = `https://api.github.com/repos/romitoorazio/fenice-investment-system/commits/${commit}/check-runs?per_page=100`;
  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response?.ok) return result("GITHUB_CHECKS_UNAVAILABLE", commit);
    const body = await response.json();
    return assessGitHubProductionChecks(body, commit, nowMs);
  } catch {
    return result("GITHUB_CHECKS_UNAVAILABLE", commit);
  }
}
