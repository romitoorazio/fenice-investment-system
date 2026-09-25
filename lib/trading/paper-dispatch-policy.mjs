const ACTIVE_RUN_STATUSES = new Set([
  "requested",
  "waiting",
  "pending",
  "queued",
  "in_progress",
]);

function parseTime(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function utcDate(value) {
  const parsed = parseTime(value);
  return parsed === null ? null : new Date(parsed).toISOString().slice(0, 10);
}

export function classifyPaperMarketSession(report, referenceDate) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(referenceDate || ""))
    ? String(referenceDate)
    : utcDate(report?.evidence?.observedAt || report?.generatedAt);
  const state = String(report?.evidence?.state || "UNKNOWN").trim().toUpperCase();
  const observedAt = parseTime(report?.evidence?.observedAt);
  const nextOpen = parseTime(report?.nextOpen);
  const authoritative = report?.configured === true
    && report?.evidence?.authoritative === true
    && report?.liveTradingAllowed === false;

  if (!day || observedAt === null || utcDate(observedAt) !== day || !authoritative) {
    return "UNKNOWN";
  }
  if (state === "OPEN" && report?.decision?.allowed === true) return "OPEN";
  if (state === "HALTED") return "HALTED_RETRYABLE";
  if (state !== "CLOSED") return "UNKNOWN";

  // Alpaca reports the next regular open. A CLOSED observation before an open
  // later on the same UTC date is a pre-open checkpoint, not the day's final
  // validation opportunity. Weekends, holidays and post-close observations
  // point to a later UTC date and are final no-risk evidence for that day.
  if (nextOpen !== null && nextOpen > observedAt && utcDate(nextOpen) === day) {
    return "PRE_OPEN";
  }
  if (nextOpen !== null && nextOpen > observedAt) return "CLOSED_FINAL";
  return "UNKNOWN";
}

function findTodayEvidence(campaign, today) {
  const rows = Array.isArray(campaign?.dailyEvidence) ? campaign.dailyEvidence : [];
  return rows.find((row) => String(row?.date || "").slice(0, 10) === today) || null;
}

function evidenceIsSafe(row) {
  return row?.liveTradingAllowed === false
    && row?.brokerConnectivityAllowed === false
    && Number(row?.liveOrders || 0) === 0
    && row?.auditChainValid === true
    && row?.reconciliationBalanced === true
    && Number(row?.reconciliationBreaks || 0) === 0
    && row?.validationFingerprint?.complete === true
    && row?.validationFingerprint?.algorithm === "sha256";
}

function selectSessionReport(row, persistedReport, today) {
  const embedded = row?.marketSession;
  if (embedded && utcDate(embedded?.evidence?.observedAt) === today) return embedded;
  if (utcDate(persistedReport?.evidence?.observedAt) === today) return persistedReport;
  return null;
}

export function evaluatePaperValidationDispatch({
  campaign,
  marketSession,
  workflowRuns,
  now = Date.now(),
} = {}) {
  const nowMs = Number(now);
  const today = Number.isFinite(nowMs) ? new Date(nowMs).toISOString().slice(0, 10) : null;
  if (!today) throw new Error("PAPER_DISPATCH_INVALID_NOW");

  const todayEvidence = findTodayEvidence(campaign, today);
  const sessionReport = selectSessionReport(todayEvidence, marketSession, today);
  const sessionPhase = classifyPaperMarketSession(sessionReport, today);
  const finalSessionPhase = sessionPhase === "OPEN" || sessionPhase === "CLOSED_FINAL";
  const finalEvidenceToday = Boolean(todayEvidence && evidenceIsSafe(todayEvidence) && finalSessionPhase);

  const runs = Array.isArray(workflowRuns) ? workflowRuns : [];
  const activeRuns = runs.filter((run) => ACTIVE_RUN_STATUSES.has(String(run?.status || "").toLowerCase()));
  const activeCanonicalRun = activeRuns.length > 0;
  const shouldDispatch = !finalEvidenceToday && !activeCanonicalRun;
  const reason = finalEvidenceToday
    ? `final ${sessionPhase} PAPER evidence already exists for ${today}`
    : activeCanonicalRun
      ? `canonical PAPER validation already active (${activeRuns.map((run) => run?.databaseId || run?.id || "unknown").join(",")})`
      : todayEvidence && sessionPhase === "PRE_OPEN"
        ? `only PRE_OPEN evidence exists for ${today}; post-open retry required`
        : todayEvidence
          ? `today's evidence is not final/safe (session=${sessionPhase})`
          : `no PAPER evidence exists for ${today}`;

  return {
    today,
    shouldDispatch,
    finalEvidenceToday,
    activeCanonicalRun,
    activeRunIds: activeRuns.map((run) => run?.databaseId || run?.id || null).filter(Boolean),
    sessionPhase,
    reason,
  };
}
