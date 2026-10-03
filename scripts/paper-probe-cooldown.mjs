import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PAPER_PROVIDER_COOLDOWN_MINUTES = 15;
const activeStatuses = new Set(["queued", "in_progress", "waiting", "pending", "requested"]);

function utcTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const canonical = value.includes(".") ? value.replace(/\.(\d{1,3})Z$/, (_, digits) => `.${digits.padEnd(3, "0")}Z`)
    : value.replace(/Z$/, ".000Z");
  return new Date(parsed).toISOString() === canonical ? parsed : null;
}

// Research-quality refreshes do not identify an execution-provider request.
// Cooldown follows actual provider evidence and both canonical PAPER histories.
export function evaluatePaperProbeCooldown({ now = new Date(), probeRuns, validationRuns, executionEvidence } = {}) {
  const current = now instanceof Date ? now.getTime() : utcTimestamp(now);
  const blocked = (reason) => ({ ready: false, reason, requiredCooldownMinutes: PAPER_PROVIDER_COOLDOWN_MINUTES });
  if (current === null || !Number.isFinite(current)) return blocked("invalid-request-time");
  const providerAt = utcTimestamp(executionEvidence?.generatedAt);
  if (providerAt === null || providerAt > current) return blocked("invalid-or-future-execution-evidence-time");
  let latest = providerAt;
  let activeCycle = false;
  for (const runs of [probeRuns, validationRuns]) {
    if (!Array.isArray(runs)) return blocked("invalid-paper-run-history");
    const ids = new Set();
    for (const run of runs) {
      if (!Number.isSafeInteger(run?.databaseId) || run.databaseId <= 0 || ids.has(run.databaseId)
        || run.headBranch !== "main" || !["schedule", "workflow_dispatch"].includes(run.event)
        || (!activeStatuses.has(run.status) && run.status !== "completed")) {
        return blocked("invalid-paper-run-metadata");
      }
      ids.add(run.databaseId);
      const created = utcTimestamp(run.createdAt);
      const updated = utcTimestamp(run.updatedAt);
      if (created === null || updated === null || updated < created || updated > current) {
        return blocked("invalid-or-future-paper-run-time");
      }
      activeCycle ||= activeStatuses.has(run.status);
      latest = Math.max(latest, updated);
    }
  }
  const ageMinutes = (current - latest) / 60000;
  const ready = !activeCycle && ageMinutes >= PAPER_PROVIDER_COOLDOWN_MINUTES;
  return {
    ready, reason: activeCycle ? "canonical-paper-cycle-active" : ready ? "provider-cooldown-complete" : "provider-cooldown-pending",
    requiredCooldownMinutes: PAPER_PROVIDER_COOLDOWN_MINUTES,
    latestProviderActivityAt: new Date(latest).toISOString(), ageMinutes: Number(ageMinutes.toFixed(3)),
    activeCycle,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const flags = ["--probe-runs", "--validation-runs", "--execution-evidence"];
  const files = new Map();
  for (let index = 0; index < args.length; index += 2) {
    if (!flags.includes(args[index]) || files.has(args[index]) || !args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error("PAPER_COOLDOWN_ARGUMENT_INVALID");
    }
    files.set(args[index], args[index + 1]);
  }
  if (files.size !== flags.length) throw new Error("PAPER_COOLDOWN_ARGUMENT_MISSING");
  const inputs = await Promise.all(flags.map(async (flag) => JSON.parse(await readFile(files.get(flag), "utf8"))));
  console.log(JSON.stringify(evaluatePaperProbeCooldown({ probeRuns: inputs[0], validationRuns: inputs[1], executionEvidence: inputs[2] })));
}
