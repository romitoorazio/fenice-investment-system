import { appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PAPER_PROBE_RECOVERY_UPSTREAMS = [
  "Fenice Global Sources",
  "Fenice Foundation",
  "Fenice World Terminal",
  "Fenice Autonomous Analysis",
  "Fenice Production CI",
];

// This is only a conservative dispatch window. The frozen canonical workflow
// still requires the authoritative Alpaca session and every PAPER risk gate.
export function evaluatePaperProbeRecoveryTrigger({
  now = new Date(),
  eventName,
  ref,
  repository,
  upstream = {},
} = {}) {
  const instant = now instanceof Date ? now : new Date(now);
  const blocked = (reason) => ({ allowed: false, reason });
  if (!Number.isFinite(instant.getTime())) return blocked("invalid-request-time");

  const weekday = instant.getUTCDay();
  const minutes = instant.getUTCHours() * 60 + instant.getUTCMinutes();
  if (weekday === 0 || weekday === 6 || minutes < 875 || minutes > 1170) {
    return blocked("outside-conservative-us-recovery-window");
  }

  if (eventName === "workflow_run") {
    if (!PAPER_PROBE_RECOVERY_UPSTREAMS.includes(upstream.name)) return blocked("unapproved-upstream");
    if (upstream.event !== "schedule" || upstream.conclusion !== "success") {
      return blocked("upstream-not-successful-schedule");
    }
    if (upstream.headBranch !== "main" || !repository || upstream.headRepository !== repository) {
      return blocked("upstream-not-repository-main");
    }
  } else {
    if (!["schedule", "workflow_dispatch", "push"].includes(eventName)) return blocked("unsupported-trigger");
    if (ref !== "refs/heads/main") return blocked("trigger-not-main");
  }

  return { allowed: true, reason: "eligible-recovery-trigger" };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = evaluatePaperProbeRecoveryTrigger({
    eventName: process.env.EVENT_NAME,
    ref: process.env.GITHUB_REF,
    repository: process.env.GITHUB_REPOSITORY,
    upstream: {
      name: process.env.UPSTREAM_NAME,
      event: process.env.UPSTREAM_EVENT,
      conclusion: process.env.UPSTREAM_CONCLUSION,
      headBranch: process.env.UPSTREAM_HEAD_BRANCH,
      headRepository: process.env.UPSTREAM_HEAD_REPOSITORY,
    },
  });
  console.log(`PAPER recovery trigger: allowed=${result.allowed}; reason=${result.reason}.`);
  const outputIndex = process.argv.indexOf("--github-output");
  if (outputIndex >= 0) {
    const outputPath = process.argv[outputIndex + 1];
    if (!outputPath || outputPath.startsWith("--")) throw new Error("Missing GitHub output path");
    await appendFile(outputPath, `allowed=${result.allowed}\nreason=${result.reason}\n`, "utf8");
  }
  if (process.argv.includes("--require-allowed") && !result.allowed) process.exitCode = 1;
}
