import { appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAPER_PROBE_RECOVERY_UPSTREAMS } from "./paper-probe-recovery-trigger.mjs";

// Event-driven fallback for the lightweight PAPER daily-evidence dispatcher.
// It deliberately starts later than probe recovery so normal probe opportunities
// run first. Passing this gate never creates evidence itself: it only permits the
// existing dispatcher to re-check final evidence and active canonical runs.
export function evaluatePaperValidationEventRecovery({
  now = new Date(),
  eventName,
  repository,
  upstream = {},
} = {}) {
  const instant = now instanceof Date ? now : new Date(now);
  const blocked = (reason) => ({ allowed: false, reason });
  if (!Number.isFinite(instant.getTime())) return blocked("invalid-request-time");
  if (eventName !== "workflow_run") return blocked("unsupported-trigger");

  const weekday = instant.getUTCDay();
  const minutes = instant.getUTCHours() * 60 + instant.getUTCMinutes();
  if (weekday === 0 || weekday === 6 || minutes < 1025 || minutes > 1170) {
    return blocked("outside-daily-evidence-recovery-window");
  }

  if (!PAPER_PROBE_RECOVERY_UPSTREAMS.includes(upstream.name)) return blocked("unapproved-upstream");

  // Scheduled trusted upstreams remain the normal recovery source. A successful
  // Production CI push on main is also trusted because it is the repository's
  // post-merge safety gate and can occur after GitHub has already missed the
  // day's final scheduled dispatcher checkpoint. Other push-triggered workflows
  // remain excluded to avoid broadening recovery provenance unnecessarily.
  const approvedUpstreamEvent = upstream.event === "schedule"
    || (upstream.event === "push" && upstream.name === "Fenice Production CI");
  if (!approvedUpstreamEvent || upstream.conclusion !== "success") {
    return blocked("upstream-not-successful-approved-event");
  }
  if (upstream.headBranch !== "main" || !repository || upstream.headRepository !== repository) {
    return blocked("upstream-not-repository-main");
  }

  return { allowed: true, reason: "eligible-daily-evidence-recovery-trigger" };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = evaluatePaperValidationEventRecovery({
    eventName: process.env.EVENT_NAME,
    repository: process.env.GITHUB_REPOSITORY,
    upstream: {
      name: process.env.UPSTREAM_NAME,
      event: process.env.UPSTREAM_EVENT,
      conclusion: process.env.UPSTREAM_CONCLUSION,
      headBranch: process.env.UPSTREAM_HEAD_BRANCH,
      headRepository: process.env.UPSTREAM_HEAD_REPOSITORY,
    },
  });
  console.log(`PAPER daily evidence event recovery: allowed=${result.allowed}; reason=${result.reason}.`);
  const outputIndex = process.argv.indexOf("--github-output");
  if (outputIndex >= 0) {
    const outputPath = process.argv[outputIndex + 1];
    if (!outputPath || outputPath.startsWith("--")) throw new Error("Missing GitHub output path");
    await appendFile(outputPath, `allowed=${result.allowed}\nreason=${result.reason}\n`, "utf8");
  }
}
