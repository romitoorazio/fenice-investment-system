/*
 * FENICE100K read-only root-cause report.
 * This module MUST NOT be imported into the V6 fingerprinted order path.
 * It evaluates recorded snapshots; its output NEVER authorizes orders.
 */
const numeric = (v, fallback = 0) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
const list = (v) => Array.isArray(v) ? v : [];
const instant = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;

export function diagnoseFeniceReadiness(input, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("INVALID_DIAGNOSTIC_CLOCK");
  const {
    sources = {}, campaign = {}, approval = {}, oms = {}, queue = {},
    coverage = {}, committee = {}, terminal = {}, world = {}, v7Gate = {},
    shadowCalibration = {}, continuationPlan = {},
  } = input || {};
  const filled = list(oms.executions).filter(x => x && x.status === "PAPER_FILLED");
  const attempts = list(oms.executions).filter(x => String(x && x.clientOrderId || "")
    .startsWith(String(approval.idPrefix || "fenice-paper-validation-v6-"))).length;
  const lastFill = filled.map(x => instant(x.filledAt)).filter(x => x !== null).sort((a, b) => b - a)[0] ?? null;
  const expiry = instant(approval.expiresAt);
  const expired = expiry === null || now >= expiry;
  const count = numeric(campaign.minPaperFills, numeric(approval.targetPaperFills, 10));
  const reportedFills = numeric(list(campaign.dailyEvidence).at(-1)?.cumulativePaperFilled, 0);
  const symbolCoverage = new Map(list(coverage.rows).map(x => [String(x.symbol || "").toUpperCase(), x]));
  const symbols = new Map(list(terminal.assets).map(x => [String(x.symbol || "").toUpperCase(), x]));
  const permittedDecisions = list(approval.permittedDecisionStates).map(x => String(x).toUpperCase());
  const permittedCurrencies = list(approval.permittedCurrencies).map(x => String(x).toUpperCase());
  const scored = list(committee.topDecisions).map(d => {
    const symbol = String(d.symbol || "").toUpperCase();
    const row = symbolCoverage.get(symbol);
    const asset = symbols.get(symbol);
    const reasons = [];
    const currency = String(d.currency || asset?.currency || "").toUpperCase();
    const rawConfidence = numeric(d.rawConfidenceBeforeCalibration, numeric(d.confidence));
    const validationConfidence = Math.min(rawConfidence, numeric(asset?.confidence));
    const riskScore = Math.max(numeric(d.riskScore, 100), numeric(asset?.riskScore, 100));
    const committeeScore = numeric(d.committeeScore);
    if (!(row?.paperEligible === true && ["GREEN", "CAUTION"].includes(String(row?.state || "").toUpperCase())
      && numeric(row?.independentSourceFamilies) >= 2 && numeric(row?.medianPrice) > 0)) reasons.push("PAPER_QUOTE_QUORUM_MISSING");
    if (!permittedDecisions.includes(String(d.decision || "").toUpperCase())) reasons.push("COMMITTEE_DECISION_NOT_PERMITTED");
    if (!asset || ["ATTENDI", "EVITA"].includes(String(asset.decision || "").toUpperCase())) reasons.push("TERMINAL_DECISION_BLOCKED");
    if (committeeScore < numeric(approval.minCommitteeScore, 70)) reasons.push("COMMITTEE_SCORE_BELOW_MINIMUM");
    if (validationConfidence < numeric(approval.minValidationDataConfidence, 90)) reasons.push("VALIDATION_CONFIDENCE_BELOW_MINIMUM");
    if (riskScore > numeric(approval.maxRiskScore, 75)) reasons.push("RISK_ABOVE_MAXIMUM");
    if (!permittedCurrencies.includes(currency)) reasons.push("CURRENCY_NOT_PERMITTED");
    // This is the preliminary candidate screen, NOT a reimplementation of
    // FX, session, risk, pending-order, notional or idempotency execution gates.
    return {
      symbol, committeeScore, decision: d.decision || null,
      terminalDecision: asset?.decision || null,
      paperQuoteEligible: row?.paperEligible === true,
      rawDataConfidence: validationConfidence, riskScore,
      preliminaryBlockers: reasons,
      preliminaryCandidate: reasons.length === 0,
    };
  });

  const v7SevenDay = v7Gate?.evidence?.sevenDay || {};
  const v7ThirtyDay = v7Gate?.evidence?.thirtyDay || {};
  const alerts = [];
  const add = (code, priority, explanation, nextStep) =>
    alerts.push({code, priority, explanation, nextStep});
  if (expiry === null || expired || (expiry - now < 48 * 3_600_000 && filled.length < count)) {
    add("V6_APPROVAL_WINDOW", "CRITICAL",
      expired ? "Original V6 authority expired; Phase B is NOT authorized." : "Original V6 approval expires with missing fills.",
      "Preserve old evidence; after expiry require a separate, explicit PAPER-only Phase B approval and new baseline.");
  }
  if (filled.length < count) add("V6_FILL_SHORTFALL", "HIGH",
    "Only " + filled.length + "/" + count + " actual PAPER_FILLED ledger executions; latest " +
      (lastFill === null ? "none" : new Date(lastFill).toISOString().slice(0, 10)) + ".",
    "Do not synthesize fills or relax the original entry/risk policy.");
  if (scored.length && scored.every(x => !x.preliminaryCandidate)) add("NO_PRELIMINARY_PAPER_CANDIDATES", "HIGH",
    "All " + scored.length + " current committee top decisions fail at least one PAPER stager precheck.",
    "Investigate data and strategy quality; do not change the threshold merely to produce fills.");
  if (numeric(coverage.paperEligibleSymbols) < numeric(coverage.requestedSymbols)) add("PAPER_QUOTE_COVERAGE_GAP", "HIGH",
    "Only " + numeric(coverage.paperEligibleSymbols) + "/" + numeric(coverage.requestedSymbols) + " symbols have eligible PAPER quotes.",
    "Obtain verified independent quote families with appropriate rights before extending venue coverage.");
  if (world.paperEligible !== true && world?.summary?.certifiedPaperFills === 0) add("GLOBAL_V7_RESEARCH_ONLY", "HIGH",
    "Global venue ledger has zero certified international PAPER fills.",
    "Keep venue MIC, provider entitlements, market-hours and FX proofs separate from end-of-day research.");
  if (v7Gate.state !== "READY" || v7Gate.eligibleForHumanResearchReview !== true) add("V7_FORWARD_EDGE_NOT_PROVEN", "HIGH",
    "Shadow gate is " + String(v7Gate.state || "UNKNOWN") + "; 7d sample " +
    numeric(v7SevenDay.sampleSize) + ", mean " + (v7SevenDay.averageReturnPercent ?? "N/A") +
    "%; 30d sample " + numeric(v7ThirtyDay.sampleSize) + ".",
    "Accumulate independent forward observations versus cash and an independent benchmark; no automatic promotion.");
  if (shadowCalibration?.researchCalibration?.["7d"]?.state === "POOR") add("V7_CALIBRATION_POOR", "HIGH",
    "Short-horizon calibration is POOR; quoted confidence is not realized forecast accuracy.",
    "Recalibrate using out-of-sample forward data before claiming predictive skill.");
  if (numeric(sources?.summary?.healthy) === numeric(sources.totalSources) && numeric(sources.totalSources) > 0
      && numeric(coverage.paperEligibleSymbols) < numeric(coverage.requestedSymbols)) {
    add("HEALTH_NOT_TRADING_ENTITLEMENT", "INFO",
      "General source health is green but tradable PAPER market coverage is incomplete.",
      "Display source health and execution data rights as separate metrics.");
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    purpose: "READ_ONLY_DIAGNOSTIC_NEVER_ORDER_AUTHORITY",
    liveTradingAllowed: false,
    brokerOrderSubmissionAllowed: false,
    paperOrderSubmissionAuthorizedByThisReport: false,
    v6FingerprintOrEvidenceModified: false,
    sourceHealth: {
      healthy: numeric(sources?.summary?.healthy), total: numeric(sources.totalSources),
      criticalReady: numeric(sources?.critical?.ready), criticalTotal: numeric(sources?.critical?.total),
      score: numeric(sources.reliabilityScore),
    },
    paper: {
      evidenceDaysReported: list(campaign.dailyEvidence).length,
      targetFills: count, recordedFills: filled.length, campaignReportedFills: reportedFills,
      ledgerMatchesCampaign: filled.length === reportedFills,
      pendingOrders: list(queue.orders).length, attempts,
      lastFillAt: lastFill === null ? null : new Date(lastFill).toISOString(),
      daysSinceLastFill: lastFill === null ? null : Math.max(0, Math.floor((now - lastFill) / 86_400_000)),
      originalApprovalExpiry: approval.expiresAt || null,
      expired, approvalStillOriginal: continuationPlan?.phase === "PREPARATION_NOT_EXECUTION",
      safetyLocksIntact: approval.liveTradingAllowed === false && approval.brokerConnectivityAllowed === false
        && campaign.liveTradingAllowed === false && oms.liveTradingAllowed === false
        && oms.brokerConnectivityAllowed === false,
      reconciliationBalanced: oms?.reconciliation?.balanced === true && list(oms?.reconciliation?.breaks).length === 0,
    },
    marketCoverage: {
      qualifiedPaperSymbols: numeric(coverage.paperEligibleSymbols),
      requestedSymbols: numeric(coverage.requestedSymbols),
      caution: list(coverage.cautionSymbols), blocked: list(coverage.blockedSymbols),
    },
    committee: {
      candidatesReviewed: scored.length, preliminaryCandidates: scored.filter(x => x.preliminaryCandidate).length,
      diagnosticOnly: true, symbolBreakdown: scored,
    },
    worldV7: {
      certifiedInternationalPaperFills: numeric(world?.summary?.certifiedPaperFills),
      venuesTracked: numeric(world?.summary?.venuesTracked),
      regions: list(world?.summary?.regions),
      blockedVenueCount: Object.values(world?.venues || {}).filter(x => x?.paperEligible !== true).length,
    },
    shadowV7: {
      promotionGate: v7Gate.state || "UNKNOWN",
      sevenDaySample: numeric(v7SevenDay.sampleSize),
      sevenDayAverageReturnPercent: v7SevenDay.averageReturnPercent ?? null,
      thirtyDaySample: numeric(v7ThirtyDay.sampleSize),
      calibrationSevenDay: shadowCalibration?.researchCalibration?.["7d"]?.state || "UNKNOWN",
    },
    alerts,
  };
}
