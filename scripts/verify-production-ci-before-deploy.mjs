import { readFileSync } from "node:fs";
import { assessGitHubProductionChecks } from "../lib/ui/github-production-checks.mjs";

/**
 * GitHub Actions scheduled-release gate: strictly fail closed.
 * STDIN is the official GitHub Checks API response. STDOUT contains ONLY
 * the documented GitHub Actions step output ("authorized=true|false").
 * No token, response payload, credential or account data is logged.
 *
 * This script cannot change authorizations, order routes or market state.
 */
const commit = process.env.GITHUB_SHA ?? "";
let payload = null;
try {
  const raw = readFileSync(0, "utf8");
  if (raw.length > 512_000) throw new Error("GitHub check-runs response too large");
  payload = JSON.parse(raw);
} catch {
  // Bad JSON, empty/missing stdin, or oversized response always deny deploy.
}

const outcome = assessGitHubProductionChecks(payload, commit, Date.now());
process.stdout.write(`authorized=${outcome.verified ? "true" : "false"}\n`);
process.stderr.write(`Exact-SHA production CI check: ${outcome.state}; ${outcome.passedChecks.length}/${outcome.requiredChecks.length} required checks passed.\n`);
if (!outcome.verified)
  process.stderr.write("Skipping production refresh, retaining existing READY deployment.\n");
