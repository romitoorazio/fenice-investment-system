import { readFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Dispatch only a timely, independently checked V7 PAPER observation.
// V7 performs its own fresh price, FX, session, fingerprint and risk checks.
export function assessV7ForwardDispatch({ event, campaign, approval, days, runs = [], nowMs }) {
  const blocked = (reason) => ({ dispatch: false, reason });
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) return blocked("INVALID_CLOCK");
  const source = event?.workflow_run;
  if (source?.name !== "Fenice Paper Validation"
    || source?.conclusion !== "success" || source?.head_branch !== "main"
    || source?.head_repository?.full_name !== event?.repository?.full_name
    || !["schedule", "workflow_dispatch"].includes(source?.event)) return blocked("UNTRUSTED_OR_FAILED_UPSTREAM");

  const approvedAt = Date.parse(approval?.approvedAt ?? "");
  const expiresAt = Date.parse(approval?.expiresAt ?? "");
  if (approval?.approved !== true || approval?.humanConfirmation !== true
    || approval?.mode !== "PAPER" || approval?.liveTradingAllowed !== false
    || approval?.brokerConnectivityAllowed !== false
    || approval?.coreFingerprint?.complete !== true
    || !Number.isFinite(approvedAt) || !Number.isFinite(expiresAt)
    || nowMs < approvedAt || nowMs >= expiresAt) return blocked("V7_APPROVAL_NOT_ACTIVE");

  const latest = campaign?.dailyEvidence?.at(-1);
  const capturedAt = Date.parse(latest?.observedAt ?? "");
  const completedAt = Date.parse(source.updated_at ?? "");
  const market = latest?.marketSession;
  const closeAt = Date.parse(market?.nextClose ?? "");
  // GitHub cron delivery can slip hours. Only dispatch near the actual
  // completed evidence, and with time left to refresh during the session.
  if (latest?.date !== new Date(nowMs).toISOString().slice(0, 10)
    || !Number.isFinite(capturedAt) || capturedAt > nowMs
    || nowMs - capturedAt > 30 * 60_000
    || !Number.isFinite(completedAt) || completedAt > nowMs + 60_000
    || completedAt < capturedAt || completedAt - capturedAt > 15 * 60_000)
    return blocked("UPSTREAM_EVIDENCE_OUT_OF_WINDOW");

  if (market?.evidence?.state !== "OPEN"
    || market?.evidence?.authoritative !== true
    || market?.decision?.allowed !== true
    || market?.liveTradingAllowed !== false
    || !Number.isFinite(closeAt) || closeAt - nowMs < 20 * 60_000)
    return blocked("NO_VERIFIED_OPEN_SESSION_TIME");

  const coverage = latest.executionMarketCoverage;
  if (coverage?.ready !== true || coverage?.fresh !== true
    || coverage?.matchesEvidence !== true || coverage?.policyReady !== true
    || coverage?.broadCoverageReady !== true
    || coverage?.paperSourceRedundancyReady !== true
    || Number(coverage?.paperEligibleSymbols) < 3
    || Number(coverage?.paperEligibleSourceFamilies) < 2
    || latest?.liveTradingAllowed !== false
    || latest?.brokerConnectivityAllowed !== false
    || latest?.liveOrders !== 0)
    return blocked("V6_MARKET_EVIDENCE_NOT_ELIGIBLE");

  const today = new Date(nowMs).toISOString().slice(0, 10);
  if (days?.mode !== "V7_PHASE_B_FORWARD_DAYS" || !Array.isArray(days.days)
    || days.days.some((d) => d.date === today && d.fillCount > 0))
    return blocked("V7_ALREADY_FILLED_OR_INVALID_LEDGER");

  // Avoid duplicate provider spending when the regular V7 run is already
  // queued/running or a successful V7 request was just launched.
  if (!Array.isArray(runs)) return blocked("V7_RUN_STATUS_MISSING");
  for (const run of runs) {
    const started = Date.parse(run?.createdAt ?? "");
    if (!Number.isFinite(started) || started > nowMs + 60_000
      || nowMs - started > 20 * 60_000) continue;
    if (["queued", "in_progress", "pending", "requested", "waiting"].includes(run.status)
      || (run.status === "completed" && run.conclusion === "success"))
      return blocked("V7_RECENT_OR_ACTIVE_RUN");
  }
  return { dispatch: true, reason: "FRESH_V6_EVIDENCE_AND_ACTIVE_V7_PAPER_APPROVAL" };
}

// The scheduled fallback never trusts a stored PAPER snapshot alone.
// It must first recover a *successful, completed* canonical V6 workflow
// from GitHub Actions and pass that event through the same strict gate.
export function deriveFallbackV6Event({ runs, repository, nowMs }) {
  if (!Array.isArray(runs) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repository || ""))
    || !Number.isSafeInteger(nowMs) || nowMs <= 0) return null;
  const eligible = runs.filter((run) => {
    const finishedAt = Date.parse(run?.updatedAt ?? "");
    return run?.status === "completed"
      && run?.conclusion === "success"
      && run?.headBranch === "main"
      && ["schedule", "workflow_dispatch"].includes(run?.event)
      && Number.isFinite(finishedAt)
      && finishedAt <= nowMs
      && nowMs - finishedAt <= 30 * 60_000;
  }).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  if (!eligible.length) return null;
  return {
    repository: { full_name: repository },
    workflow_run: {
      name: "Fenice Paper Validation",
      conclusion: "success",
      head_branch: "main",
      head_repository: { full_name: repository },
      event: eligible[0].event,
      updated_at: eligible[0].updatedAt,
    },
  };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const flag = (name) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
  };
  const output = flag("--output");
  let decision;
  try {
    const read = async (name) => JSON.parse(await readFile(flag(name), "utf8"));
    const nowMs = Date.now();
    const [campaign, approval, days, runs] = await Promise.all([
      read("--campaign"), read("--approval"), read("--days"), read("--runs"),
    ]);
    const event = flag("--fallback-v6-runs")
      ? deriveFallbackV6Event({
          runs: await read("--fallback-v6-runs"),
          repository: flag("--repository"),
          nowMs,
        })
      : await read("--event");
    decision = assessV7ForwardDispatch({ event, campaign, approval, days, runs, nowMs });
  } catch {
    decision = { dispatch: false, reason: "DISPATCH_INPUT_UNAVAILABLE" };
  }
  console.log(JSON.stringify(decision));
  if (output) await appendFile(output,
    "should_dispatch=" + String(decision.dispatch) + "\n"
    + "reason=" + decision.reason + "\n");
}
