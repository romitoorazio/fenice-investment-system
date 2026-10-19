import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// A successful scheduled/merge Foundation run may recover a skipped GitHub
// opening cron, but only as *early-session* evidence, never as proof that an
// opening-window scheduled check arrived on time.
export const RECOVERY_EARLIEST_ET_MINUTE = 9 * 60 + 45;
export const RECOVERY_LATEST_ET_MINUTE = 11 * 60 + 30;
const SCHEDULES = new Set([
  "45 13 * * 1-5", // US summer opening window
  "45 14 * * 1-5", // US winter opening window
  "15 16 * * 1-5", // Mid-session recovery, valid across DST
]);
export const MAX_SCHEDULE_DELAY_MINUTES = 75;

/**
 * GitHub scheduled jobs can start hours late. Successful closed-market checks
 * must not be mistaken for market-open validation. This checks scheduler
 * timeliness only; it never infers the exchange's actual open/closed state.
 */
export function assessOpenReadinessSchedule({
  eventName,
  schedule,
  now = new Date(),
  maxDelayMinutes = MAX_SCHEDULE_DELAY_MINUTES,
  repository,
  upstream = {},
} = {}) {
  const checkedAt = new Date(now);
  if (!Number.isFinite(checkedAt.getTime())) {
    return { ok: false, status: "INVALID_CHECK_TIME", checkedAt: null, scheduledAt: null, delayMinutes: null };
  }
  const base = { checkedAt: checkedAt.toISOString(), scheduledAt: null, delayMinutes: null };
  if (eventName === "workflow_run") {
    // GitHub's workflow_run fires even if the upstream was not scheduled.
    // Never trust a different repository/branch/producer or an unfinished job.
    const provenance = upstream.name === "Fenice Foundation"
      && upstream.conclusion === "success"
      && upstream.headBranch === "main"
      && typeof repository === "string" && repository.length > 0
      && upstream.headRepository === repository
      && ["schedule", "push"].includes(upstream.event);
    if (!provenance) {
      return { ...base, ok: false, status: "UNTRUSTED_RECOVERY_PROVENANCE",
        samplingKind: "NO_MARKET_OPEN_EVIDENCE" };
    }
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", weekday: "short", hour: "2-digit",
      minute: "2-digit", hourCycle: "h23",
    }).formatToParts(checkedAt).map(x => [x.type,x.value]));
    const marketMinutes = Number(parts.hour)*60+Number(parts.minute);
    const weekday = !["Sat","Sun"].includes(parts.weekday);
    const inWindow = weekday && marketMinutes >= RECOVERY_EARLIEST_ET_MINUTE
      && marketMinutes <= RECOVERY_LATEST_ET_MINUTE;
    return { ...base, ok: inWindow,
      status: inWindow ? "EARLY_SESSION_RECOVERY_NOT_OPENING_PROOF" : "OUTSIDE_EARLY_SESSION_RECOVERY_WINDOW",
      samplingKind: inWindow ? "EARLY_SESSION_RECOVERY_ONLY" : "NO_MARKET_OPEN_EVIDENCE",
      exchangeLocalClock: `${parts.weekday} ${parts.hour}:${parts.minute} America/New_York` };
  }
  if (eventName !== "schedule") {
    return { ...base, ok: true, status: "NOT_SCHEDULED" };
  }
  const normalized = String(schedule || "").trim();
  if (!SCHEDULES.has(normalized)) {
    return { ...base, ok: false, status: "UNKNOWN_SCHEDULE" };
  }
  const [minute, hour] = normalized.split(" ").map(Number);
  const current = checkedAt.getTime();
  let latest = null;
  for (let back = 0; back <= 7; back++) {
    const candidate = new Date(Date.UTC(
      checkedAt.getUTCFullYear(), checkedAt.getUTCMonth(),
      checkedAt.getUTCDate() - back, hour, minute,
    ));
    const weekday = candidate.getUTCDay();
    if (weekday < 1 || weekday > 5 || candidate.getTime() > current + 5000) continue;
    if (latest === null || candidate.getTime() > latest) latest = candidate.getTime();
  }
  if (latest === null) {
    return { ...base, ok: false, status: "SCHEDULE_WINDOW_UNAVAILABLE" };
  }
  const delayMinutes = Number(((current - latest) / 60000).toFixed(2));
  return {
    ...base,
    scheduledAt: new Date(latest).toISOString(),
    delayMinutes,
    ok: delayMinutes >= -0.1 && delayMinutes <= maxDelayMinutes,
    status: delayMinutes >= -0.1 && delayMinutes <= maxDelayMinutes ? "ON_TIME" : "MISSED_SCHEDULE_WINDOW",
  };
}

async function main() {
  const result = assessOpenReadinessSchedule({
    eventName: process.env.GITHUB_EVENT_NAME,
    schedule: process.env.FENICE_SCHEDULE_CRON,
    repository: process.env.GITHUB_REPOSITORY,
    upstream: {
      name: process.env.UPSTREAM_NAME,
      event: process.env.UPSTREAM_EVENT,
      conclusion: process.env.UPSTREAM_CONCLUSION,
      headBranch: process.env.UPSTREAM_HEAD_BRANCH,
      headRepository: process.env.UPSTREAM_HEAD_REPOSITORY,
    },
  });
  const report = {
    version: 1,
    ...result,
    eventName: process.env.GITHUB_EVENT_NAME || null,
    schedule: process.env.FENICE_SCHEDULE_CRON || null,
    policy: { maxDelayMinutes: MAX_SCHEDULE_DELAY_MINUTES,
      earliestRecoveryMarketMinute: RECOVERY_EARLIEST_ET_MINUTE,
      latestRecoveryMarketMinute: RECOVERY_LATEST_ET_MINUTE,
      recoveryIsNotScheduledOpeningProof: true,
      liveTradingAllowed: false },
  };
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  await writeFile(path.join(root, "data", "paper-open-schedule-audit.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("Fenice PAPER schedule audit:", result.status,
    "delayMinutes=" + (result.delayMinutes ?? "n/a"),
    "samplingKind=" + (result.samplingKind || "SCHEDULED_OR_MANUAL"),
    "exchangeLocalClock=" + (result.exchangeLocalClock || "n/a"));
  if (!result.ok) {
    console.error("PAPER_OPEN_SAMPLE_NOT_TRUSTED: delayed schedule or out-of-window/untrusted recovery cannot be marked successful.");
    process.exitCode = 4;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 4;
  });
}
