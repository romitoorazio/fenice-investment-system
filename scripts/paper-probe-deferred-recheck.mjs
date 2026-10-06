export const PAPER_DEFERRED_RECHECK_BUFFER_SECONDS = 5;
export const PAPER_DEFERRED_RECHECK_MAX_WAIT_SECONDS = 15 * 60 + PAPER_DEFERRED_RECHECK_BUFFER_SECONDS;

function finite(value) {
  return Number.isFinite(Number(value));
}

export function evaluateDeferredProbeRecheck({
  now = new Date(),
  eventName,
  cooldown,
  windowStartMinutes = 875,
  windowEndMinutes = 1170,
} = {}) {
  const instant = now instanceof Date ? now : new Date(now);
  const blocked = (reason) => ({ defer: false, reason, waitSeconds: 0 });
  if (!Number.isFinite(instant.getTime())) return blocked("invalid-request-time");
  if (eventName === "workflow_dispatch") return blocked("deferred-recheck-already-used");
  if (!["schedule", "workflow_run", "push"].includes(String(eventName || ""))) return blocked("unsupported-trigger");
  if (cooldown?.activeCycle === true) return blocked("canonical-paper-cycle-active");
  if (String(cooldown?.reason || "") !== "provider-cooldown-pending") return blocked("cooldown-not-pending");
  if (!finite(cooldown?.ageMinutes)) return blocked("cooldown-age-invalid");

  const ageMinutes = Number(cooldown.ageMinutes);
  if (ageMinutes < 0 || ageMinutes >= 15) return blocked("cooldown-age-outside-defer-range");

  const weekday = instant.getUTCDay();
  const minutes = instant.getUTCHours() * 60 + instant.getUTCMinutes();
  if (weekday === 0 || weekday === 6 || minutes < windowStartMinutes || minutes > windowEndMinutes) {
    return blocked("outside-conservative-us-recovery-window");
  }

  const waitSeconds = Math.ceil((15 - ageMinutes) * 60) + PAPER_DEFERRED_RECHECK_BUFFER_SECONDS;
  if (waitSeconds <= 0 || waitSeconds > PAPER_DEFERRED_RECHECK_MAX_WAIT_SECONDS) return blocked("defer-wait-invalid");

  const deferredAt = new Date(instant.getTime() + waitSeconds * 1000);
  const deferredMinutes = deferredAt.getUTCHours() * 60 + deferredAt.getUTCMinutes();
  if (deferredAt.getUTCDate() !== instant.getUTCDate() || deferredMinutes > windowEndMinutes) {
    return blocked("deferred-recheck-would-exit-window");
  }

  return {
    defer: true,
    reason: "provider-cooldown-pending-deferred-recheck",
    waitSeconds,
    deferredAt: deferredAt.toISOString(),
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  let cooldown = null;
  try {
    cooldown = JSON.parse(process.env.COOLDOWN_JSON || "null");
  } catch {
    cooldown = null;
  }
  const result = evaluateDeferredProbeRecheck({
    eventName: process.env.EVENT_NAME,
    cooldown,
  });
  process.stdout.write(JSON.stringify(result));
}
