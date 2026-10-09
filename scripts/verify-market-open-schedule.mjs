import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
} = {}) {
  const checkedAt = new Date(now);
  if (!Number.isFinite(checkedAt.getTime())) {
    return { ok: false, status: "INVALID_CHECK_TIME", checkedAt: null, scheduledAt: null, delayMinutes: null };
  }
  const base = { checkedAt: checkedAt.toISOString(), scheduledAt: null, delayMinutes: null };
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
  });
  const report = {
    version: 1,
    ...result,
    eventName: process.env.GITHUB_EVENT_NAME || null,
    schedule: process.env.FENICE_SCHEDULE_CRON || null,
    policy: { maxDelayMinutes: MAX_SCHEDULE_DELAY_MINUTES, liveTradingAllowed: false },
  };
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  await writeFile(path.join(root, "data", "paper-open-schedule-audit.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("Fenice PAPER schedule audit:", result.status, "delayMinutes=" + (result.delayMinutes ?? "n/a"));
  if (!result.ok) {
    console.error("PAPER_OPEN_SCHEDULE_MISSED: scheduled readiness cannot be marked successful.");
    process.exitCode = 4;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 4;
  });
}
