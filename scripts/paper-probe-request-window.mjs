import { appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function evaluatePaperProbeRequestWindow(now = new Date()) {
  const instant = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(instant.getTime())) {
    return { allowed: false, reason: "invalid-request-time", newYorkWeekday: null, newYorkMinutes: null };
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant).map(({ type, value }) => [type, value]),
  );

  const weekday = parts.weekday;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekdayOpen = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  const regularHours = minutes >= 9 * 60 + 30 && minutes < 16 * 60;
  const allowed = weekdayOpen && regularHours;

  return {
    allowed,
    reason: allowed ? "inside-regular-new-york-session" : "outside-regular-new-york-session",
    newYorkWeekday: weekday,
    newYorkMinutes: minutes,
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const requestedAt = argument("--requested-at") || new Date().toISOString();
  const githubOutput = argument("--github-output");
  const result = evaluatePaperProbeRequestWindow(requestedAt);
  console.log(`PAPER probe request window: allowed=${result.allowed}; reason=${result.reason}; newYorkWeekday=${result.newYorkWeekday}; newYorkMinutes=${result.newYorkMinutes}.`);
  if (githubOutput) {
    await appendFile(githubOutput, `allowed=${result.allowed}\nreason=${result.reason}\n`, "utf8");
  }
}
