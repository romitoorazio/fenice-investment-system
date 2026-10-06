import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { evaluatePaperValidationCampaign } from "../lib/trading/paper-validation.mjs";
import { validationFingerprintMatches } from "../lib/trading/validation-fingerprint.mjs";

const DAY_MS = 86_400_000;

function parseTime(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function utcDate(value) {
  const parsed = parseTime(value);
  return parsed === null ? null : new Date(parsed).toISOString().slice(0, 10);
}

function isProbe(execution, prefix) {
  return execution?.validationProbe === true || String(execution?.clientOrderId || "").startsWith(prefix);
}

function remainingWeekdaySlots({
  nowMs,
  expiresAtMs,
  maxOrdersPerDay,
  usedToday,
  recoveryWindowStartMinuteUtc = 875,
  recoveryWindowEndMinuteUtc = 1170,
}) {
  if (nowMs > expiresAtMs) return 0;
  const startDay = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const endDay = Math.floor(expiresAtMs / DAY_MS) * DAY_MS;
  let slots = 0;
  for (let day = startDay; day <= endDay; day += DAY_MS) {
    const weekday = new Date(day).getUTCDay();
    if (weekday < 1 || weekday > 5) continue;

    const windowStart = day + recoveryWindowStartMinuteUtc * 60_000;
    const windowEnd = day + recoveryWindowEndMinuteUtc * 60_000;
    const effectiveStart = Math.max(windowStart, nowMs);
    const effectiveEnd = Math.min(windowEnd, expiresAtMs);
    if (effectiveStart > effectiveEnd) continue;

    const used = day === startDay ? Math.max(0, usedToday) : 0;
    slots += Math.max(0, maxOrdersPerDay - used);
  }
  return slots;
}

export function diagnosePaperV7Runway({ campaign, approval, state, now = Date.now() }) {
  const nowMs = typeof now === "number" ? now : parseTime(now);
  const expiresAtMs = parseTime(approval?.expiresAt);
  const executions = Array.isArray(state?.executions) ? state.executions : [];
  const prefix = String(approval?.idPrefix || "fenice-paper-validation-");
  const targetFills = boundedInteger(approval?.targetPaperFills, Number(campaign?.minPaperFills || 10), 1, 50);
  const maxAttempts = boundedInteger(approval?.maxProbeAttemptsTotal, Math.max(20, targetFills * 2), targetFills, 100);
  const maxOrdersPerDay = boundedInteger(approval?.maxOrdersPerDay, 1, 1, 5);
  const probes = executions.filter((execution) => isProbe(execution, prefix));
  const paperFills = executions.filter((execution) => execution?.status === "PAPER_FILLED").length;
  const latestEvidence = Array.isArray(campaign?.dailyEvidence) ? campaign.dailyEvidence.at(-1) : null;
  const evidencedFills = Number(latestEvidence?.cumulativePaperFilled);
  const today = Number.isFinite(nowMs) ? new Date(nowMs).toISOString().slice(0, 10) : null;
  const usedToday = today
    ? probes.filter((execution) => utcDate(execution?.createdAt || execution?.filledAt) === today).length
    : 0;
  const attemptsRemaining = Math.max(0, maxAttempts - probes.length);
  const fillsRemaining = Math.max(0, targetFills - paperFills);
  const weekdaySlotsRemaining = Number.isFinite(nowMs) && expiresAtMs !== null
    ? remainingWeekdaySlots({ nowMs, expiresAtMs, maxOrdersPerDay, usedToday })
    : 0;
  const maxPossibleAdditionalFills = Math.min(attemptsRemaining, weekdaySlotsRemaining);
  const runwayMargin = maxPossibleAdditionalFills - fillsRemaining;
  const campaignStatus = Number.isFinite(nowMs)
    ? evaluatePaperValidationCampaign(campaign, nowMs)
    : null;
  const requiredCalendarDays = boundedInteger(campaign?.requiredDays, 30, 1, 365);
  const startedAtMs = parseTime(campaign?.startedAt);
  const maturityAt = startedAtMs === null
    ? null
    : new Date(startedAtMs + requiredCalendarDays * DAY_MS).toISOString();
  const maturityAtMs = parseTime(maturityAt);
  const maturityApprovalBufferHours = maturityAtMs !== null && expiresAtMs !== null
    ? Math.round(((expiresAtMs - maturityAtMs) / 3_600_000) * 10) / 10
    : null;
  const maturityWindowState = maturityApprovalBufferHours === null
    ? "UNKNOWN"
    : maturityApprovalBufferHours < 0
      ? "MISALIGNED"
      : maturityApprovalBufferHours < 24
        ? "TIGHT"
        : "SAFE";
  const warnings = [];
  if (maturityWindowState === "MISALIGNED") {
    warnings.push("operator approval expires before the campaign can satisfy its minimum calendar age; all required PAPER fills must therefore be completed before approval expiry");
  } else if (maturityWindowState === "TIGHT") {
    warnings.push("operator approval expires less than 24 hours after the earliest possible calendar maturity");
  }

  const safety = {
    clockValid: Number.isFinite(nowMs),
    approvalWindowValid: expiresAtMs !== null,
    approvalActive: approval?.approved === true,
    approvalHumanConfirmed: approval?.humanConfirmation === true,
    approvalPaperOnly: approval?.mode === "PAPER",
    campaignLiveLocked: campaign?.liveTradingAllowed === false,
    approvalLiveLocked: approval?.liveTradingAllowed === false,
    approvalBrokerLocked: approval?.brokerConnectivityAllowed === false,
    statePaperOnly: state?.mode === "PAPER",
    stateLiveLocked: state?.liveTradingAllowed === false,
    stateBrokerLocked: state?.brokerConnectivityAllowed === false,
    fillCountersMatch: Number.isFinite(evidencedFills) && evidencedFills === paperFills,
    fingerprintMatchesLatestEvidence: validationFingerprintMatches(
      campaign?.baselineFingerprint,
      latestEvidence?.validationFingerprint,
    ),
  };
  const safe = Object.values(safety).every(Boolean);
  const expired = expiresAtMs !== null && Number.isFinite(nowMs) && nowMs > expiresAtMs;

  let status = "FEASIBLE_UPPER_BOUND";
  const reasons = [];
  if (!safe) {
    status = "SAFETY_FAILURE";
    reasons.push("runway cannot be trusted because safety or evidence invariants failed");
  } else if (fillsRemaining === 0) {
    status = "FILL_TARGET_COMPLETE";
  } else if (expired) {
    status = "IMPOSSIBLE";
    reasons.push("operator approval expired before the PAPER fill target completed");
  } else if (fillsRemaining > maxPossibleAdditionalFills) {
    status = "IMPOSSIBLE";
    reasons.push(`required fills ${fillsRemaining} exceed the upper-bound capacity ${maxPossibleAdditionalFills}`);
  } else if (runwayMargin <= 2) {
    status = "TIGHT";
    reasons.push(`only ${runwayMargin} upper-bound fill slot(s) remain beyond the target`);
  }

  return {
    plannedForVersion: 7,
    activationAllowed: false,
    currentV6Modified: false,
    diagnosticOnly: true,
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    status,
    reasons,
    warnings,
    generatedFor: new Date(Number.isFinite(nowMs) ? nowMs : 0).toISOString(),
    approvalExpiresAt: approval?.expiresAt || null,
    campaignMaturityAt: maturityAt,
    maturityApprovalBufferHours,
    maturityWindowState,
    marketWeekdaysAreUpperBound: true,
    currentWeekdayExcludedAfterConservativeRecoveryWindow: true,
    targetFills,
    paperFills,
    fillsRemaining,
    maxProbeAttemptsTotal: maxAttempts,
    historicalProbeAttempts: probes.length,
    attemptsRemaining,
    maxOrdersPerDay,
    usedToday,
    weekdaySlotsRemaining,
    maxPossibleAdditionalFills,
    runwayMargin,
    evidenceDays: campaignStatus?.evidenceDays ?? 0,
    evidenceDaysRemaining: Math.max(0, Number(campaign?.minEvidenceDays || 25) - Number(campaignStatus?.evidenceDays || 0)),
    elapsedCalendarDays: campaignStatus?.elapsedCalendarDays ?? 0,
    requiredCalendarDays,
    safety,
  };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function summary(report) {
  return [
    "## Fenice PAPER V7 runway diagnostic",
    "",
    "Diagnostic only. Active PAPER V6 remains unchanged.",
    `Status: ${report.status}`,
    `Fills: ${report.paperFills}/${report.targetFills} (remaining ${report.fillsRemaining})`,
    `Probe attempts: ${report.historicalProbeAttempts}/${report.maxProbeAttemptsTotal} (remaining ${report.attemptsRemaining})`,
    `Weekday slots before approval expiry: ${report.weekdaySlotsRemaining} (upper bound; exchange holidays are not assumed)`,
    `Calendar maturity: ${report.campaignMaturityAt || "N/A"}; approval buffer: ${report.maturityApprovalBufferHours ?? "N/A"}h (${report.maturityWindowState})`,
    ...(report.warnings || []).map((warning) => `Warning: ${warning}`),
    `Maximum additional fills: ${report.maxPossibleAdditionalFills}`,
    `Runway margin: ${report.runwayMargin}`,
    `Evidence days: ${report.evidenceDays}; remaining: ${report.evidenceDaysRemaining}`,
    `LIVE locked: ${report.safety.campaignLiveLocked && report.safety.stateLiveLocked ? "yes" : "no"}`,
    "",
  ].join("\n");
}

const invokedDirectly = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  const outputPath = String(process.env.FENICE_V7_RUNWAY_REPORT || "paper-v7-runway.json").trim();
  const nowOverride = String(process.env.FENICE_V7_RUNWAY_NOW || "").trim();
  const [campaign, approval, state] = await Promise.all([
    readJson("data/paper-validation-campaign.json"),
    readJson("data/paper-validation-approval.json"),
    readJson("data/paper-oms-state.json"),
  ]);
  const report = diagnosePaperV7Runway({
    campaign,
    approval,
    state,
    now: nowOverride || Date.now(),
  });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary(report));
  console.log(`Fenice PAPER V7 runway: status=${report.status}; fills=${report.paperFills}/${report.targetFills}; attempts=${report.historicalProbeAttempts}/${report.maxProbeAttemptsTotal}; weekdaySlots=${report.weekdaySlotsRemaining}; maxAdditionalFills=${report.maxPossibleAdditionalFills}; activationAllowed=false; currentV6Modified=false; liveTradingAllowed=false.`);
  if (report.status === "SAFETY_FAILURE") process.exitCode = 2;
}
