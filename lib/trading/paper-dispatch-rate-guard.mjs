// Separate dispatch-only safety budget. Deliberately NOT part of the frozen V6
// certification core: controls automatic GitHub workflow retries, not PAPER
// eligibility, risk limits, signal generation or broker permissions.
export const MAX_AUTO_PAPER_RUNS_PER_UTC_DAY = 4;

export function evaluatePaperDispatchRateGuard({
  workflowRuns = [],
  today,
  maxAutoRuns = MAX_AUTO_PAPER_RUNS_PER_UTC_DAY,
} = {}) {
  if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today))
    throw new Error("INVALID_PAPER_DISPATCH_DAY");
  if (!Number.isSafeInteger(maxAutoRuns) || maxAutoRuns < 1 || maxAutoRuns > 10)
    throw new Error("INVALID_PAPER_DISPATCH_BUDGET");
  // Workflow listing is for the canonical validation workflow only. A
  // completed failed run still consumes budget: never retry indefinitely.
  const dailyCount = (Array.isArray(workflowRuns) ? workflowRuns : []).filter(run => {
    const stamp = run?.createdAt ?? run?.created_at;
    const parsed = typeof stamp === "string" ? Date.parse(stamp) : NaN;
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === today;
  }).length;
  return {
    dailyCount,
    maxAutoRuns,
    exhausted: dailyCount >= maxAutoRuns,
    reason: dailyCount >= maxAutoRuns ? "CANONICAL_DAILY_AUTOMATIC_RUN_BUDGET_EXHAUSTED" : "CANONICAL_DAILY_AUTOMATIC_RUN_BUDGET_AVAILABLE",
  };
}
