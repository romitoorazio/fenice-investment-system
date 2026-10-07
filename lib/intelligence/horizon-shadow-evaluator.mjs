const DAY_MS = 86_400_000;
const TRANCHE_TARGETS = [
  { number: 1, targetOffsetDays: 0 },
  { number: 2, targetOffsetDays: 7 },
  { number: 3, targetOffsetDays: 14 },
];
const CHECKPOINTS = [
  { label: "7d", targetOffsetDays: 7, graceDays: 4 },
  { label: "30d", targetOffsetDays: 30, graceDays: 5 },
];

const finite = (value) => Number.isFinite(Number(value));
const upper = (value) => String(value ?? "").trim().toUpperCase();
const round = (value, digits = 2) => {
  if (!finite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};

function ageDays(createdAt, now) {
  const created = Date.parse(String(createdAt || ""));
  if (!Number.isFinite(created)) return null;
  return Math.max(0, (now.getTime() - created) / DAY_MS);
}

function isFresh(timestamp, now, maxAgeHours = 26) {
  const parsed = Date.parse(String(timestamp || ""));
  if (!Number.isFinite(parsed)) return false;
  const age = now.getTime() - parsed;
  return age >= 0 && age <= maxAgeHours * 60 * 60 * 1000;
}

function currentPrices(committee) {
  return new Map(
    (Array.isArray(committee?.allDecisions) ? committee.allDecisions : [])
      .filter((row) => upper(row?.symbol) && finite(row?.currentPrice) && Number(row.currentPrice) > 0)
      .map((row) => [upper(row.symbol), Number(row.currentPrice)]),
  );
}

function committeeRows(committee) {
  return new Map(
    (Array.isArray(committee?.allDecisions) ? committee.allDecisions : [])
      .filter((row) => upper(row?.symbol))
      .map((row) => [upper(row.symbol), row]),
  );
}

export function selectForwardShadowCandidates(horizonReport, committee, now = new Date()) {
  const sourceFresh = isFresh(horizonReport?.generatedAt, now) && isFresh(committee?.generatedAt, now);
  if (!sourceFresh) return [];

  const bySymbol = committeeRows(committee);
  return (Array.isArray(horizonReport?.rows) ? horizonReport.rows : [])
    .filter((row) => row?.strategic?.state === "ACCUMULA_A_TRANCHE_SHADOW")
    .map((row) => {
      const symbol = upper(row?.symbol);
      const committeeRow = bySymbol.get(symbol);
      const price = Number(committeeRow?.currentPrice);
      if (!symbol || !finite(price) || price <= 0) return null;
      return {
        symbol,
        name: committeeRow?.name ?? row?.name ?? symbol,
        currency: committeeRow?.currency ?? null,
        currentPrice: price,
        committeeScore: finite(committeeRow?.committeeScore) ? Number(committeeRow.committeeScore) : null,
        rawConfidence: finite(committeeRow?.rawConfidenceBeforeCalibration)
          ? Number(committeeRow.rawConfidenceBeforeCalibration)
          : finite(committeeRow?.confidence) ? Number(committeeRow.confidence) : null,
        riskScore: finite(committeeRow?.riskScore) ? Number(committeeRow.riskScore) : null,
        currentDecision: upper(committeeRow?.decision) || null,
        terminalDecision: upper(committeeRow?.terminalDecision) || null,
        positionType: committeeRow?.positionType ?? null,
      };
    })
    .filter(Boolean);
}

function trancheReturnPercent(tranche, currentPrice) {
  if (!tranche || tranche.status !== "EXECUTED" || !finite(tranche.price) || !finite(currentPrice)) return null;
  return ((Number(currentPrice) / Number(tranche.price)) - 1) * 100;
}

export function stagedReturnPercent(tranches, currentPrice) {
  const returns = (Array.isArray(tranches) ? tranches : [])
    .map((tranche) => trancheReturnPercent(tranche, currentPrice))
    .filter(finite)
    .map(Number);
  if (!returns.length) return null;
  return round(returns.reduce((sum, value) => sum + value, 0) / returns.length);
}

function lumpSumReturnPercent(record, currentPrice) {
  if (!finite(record?.referencePrice) || !finite(currentPrice) || Number(record.referencePrice) <= 0) return null;
  return round(((Number(currentPrice) / Number(record.referencePrice)) - 1) * 100);
}

function classifyVsWait(strategyReturnPercent, neutralBandPercent = 0.5) {
  if (!finite(strategyReturnPercent)) return "INSUFFICIENT";
  const value = Number(strategyReturnPercent);
  const band = Math.max(0, Number(neutralBandPercent) || 0);
  if (value > band) return "BEATS_WAIT";
  if (value < -band) return "LAGS_WAIT";
  return "NEUTRAL_VS_WAIT";
}

function markRecord(record, currentPrice, now) {
  if (!finite(currentPrice) || Number(currentPrice) <= 0) return;
  const staged = stagedReturnPercent(record.tranches, currentPrice);
  const lump = lumpSumReturnPercent(record, currentPrice);
  record.lastPrice = round(currentPrice);
  record.lastMarkedAt = now.toISOString();
  record.stagedMarkToMarketPercent = staged;
  record.lumpSumMarkToMarketPercent = lump;

  if (finite(staged)) {
    const value = Number(staged);
    record.bestObservedStagedReturnPercent = finite(record.bestObservedStagedReturnPercent)
      ? round(Math.max(Number(record.bestObservedStagedReturnPercent), value))
      : round(value);
    record.worstObservedStagedReturnPercent = finite(record.worstObservedStagedReturnPercent)
      ? round(Math.min(Number(record.worstObservedStagedReturnPercent), value))
      : round(value);
  }
}

function maybeAdvanceTranches(record, currentPrice, eligibleNow, now, graceDays = 4) {
  const age = ageDays(record.createdAt, now);
  if (!finite(age) || !finite(currentPrice)) return;

  for (const tranche of record.tranches) {
    if (tranche.status !== "PENDING") continue;
    const target = Number(tranche.targetOffsetDays);
    if (age < target) continue;

    if (age > target + graceDays) {
      tranche.status = "SKIPPED_SIGNAL_INVALIDATED";
      tranche.resolvedAt = now.toISOString();
      tranche.reason = "Shadow eligibility was not confirmed inside the execution window.";
      continue;
    }

    if (!eligibleNow) continue;

    tranche.status = "EXECUTED";
    tranche.executedAt = now.toISOString();
    tranche.price = round(currentPrice);
    tranche.reason = tranche.number === 1
      ? "Initial forward-only shadow tranche."
      : "Shadow eligibility remained valid at scheduled tranche window.";
  }
}

function maybeCheckpoint(record, currentPrice, now, checkpoint) {
  record.checkpoints ??= {};
  if (record.checkpoints[checkpoint.label]) return;

  const age = ageDays(record.createdAt, now);
  if (!finite(age) || age < checkpoint.targetOffsetDays) return;
  if (age > checkpoint.targetOffsetDays + checkpoint.graceDays) {
    record.checkpoints[checkpoint.label] = {
      status: "MISSED",
      targetOffsetDays: checkpoint.targetOffsetDays,
      resolvedAt: now.toISOString(),
      reason: "No fresh evaluation mark arrived inside the checkpoint window.",
    };
    return;
  }

  const staged = stagedReturnPercent(record.tranches, currentPrice);
  const lump = lumpSumReturnPercent(record, currentPrice);
  if (!finite(staged) || !finite(lump)) return;

  record.checkpoints[checkpoint.label] = {
    status: "MEASURED",
    measuredAt: now.toISOString(),
    targetOffsetDays: checkpoint.targetOffsetDays,
    currentPrice: round(currentPrice),
    executedTrancheCount: record.tranches.filter((tranche) => tranche.status === "EXECUTED").length,
    stagedReturnPercent: staged,
    waitBaselineReturnPercent: 0,
    alphaVsWaitPercent: staged,
    lumpSumReturnPercent: lump,
    stagedVsLumpPercent: round(Number(staged) - Number(lump)),
    worstObservedStagedReturnPercent: finite(record.worstObservedStagedReturnPercent)
      ? Number(record.worstObservedStagedReturnPercent)
      : null,
    resultVsWait: classifyVsWait(staged),
  };
}

export function updateForwardShadowLedger(previous, {
  horizonReport,
  committee,
} = {}, {
  now = new Date(),
  maxRecords = 5_000,
} = {}) {
  const records = structuredClone(Array.isArray(previous?.records) ? previous.records : []);
  const prices = currentPrices(committee);
  const selected = selectForwardShadowCandidates(horizonReport, committee, now);
  const eligible = new Set(selected.map((candidate) => candidate.symbol));
  const sourceFresh = isFresh(horizonReport?.generatedAt, now) && isFresh(committee?.generatedAt, now);

  if (sourceFresh) {
    for (const record of records) {
      const price = prices.get(upper(record.symbol));
      if (!finite(price)) continue;
      maybeAdvanceTranches(record, price, eligible.has(upper(record.symbol)), now);
      markRecord(record, price, now);
      for (const checkpoint of CHECKPOINTS) maybeCheckpoint(record, price, now, checkpoint);
    }

    const observationDate = now.toISOString().slice(0, 10);
    const existing = new Set(records.map((record) => String(record.id || "")));
    for (const candidate of selected) {
      const id = observationDate + ":" + candidate.symbol;
      if (existing.has(id)) continue;

      const record = {
        id,
        observationDate,
        createdAt: now.toISOString(),
        source: {
          horizonGeneratedAt: horizonReport?.generatedAt ?? null,
          committeeGeneratedAt: committee?.generatedAt ?? null,
          marketRegime: committee?.marketRegime ?? null,
        },
        symbol: candidate.symbol,
        name: candidate.name,
        currency: candidate.currency,
        committeeScore: candidate.committeeScore,
        rawConfidence: candidate.rawConfidence,
        riskScore: candidate.riskScore,
        currentDecision: candidate.currentDecision,
        terminalDecision: candidate.terminalDecision,
        positionType: candidate.positionType,
        referencePrice: round(candidate.currentPrice),
        lastPrice: round(candidate.currentPrice),
        lastMarkedAt: now.toISOString(),
        stagedMarkToMarketPercent: 0,
        lumpSumMarkToMarketPercent: 0,
        bestObservedStagedReturnPercent: 0,
        worstObservedStagedReturnPercent: 0,
        tranches: TRANCHE_TARGETS.map((definition) => ({
          ...definition,
          status: definition.number === 1 ? "EXECUTED" : "PENDING",
          executedAt: definition.number === 1 ? now.toISOString() : null,
          resolvedAt: definition.number === 1 ? now.toISOString() : null,
          price: definition.number === 1 ? round(candidate.currentPrice) : null,
          reason: definition.number === 1 ? "Initial forward-only shadow tranche." : null,
        })),
        checkpoints: {},
        researchOnly: true,
        executionEligible: false,
        paperCertificationEligible: false,
        brokerSubmissionAllowed: false,
        liveTradingAllowed: false,
      };
      records.push(record);
      existing.add(id);
    }
  }

  const capped = records.slice(-Math.max(1, Math.min(20_000, Number(maxRecords) || 5_000)));
  return {
    version: 1,
    generatedAt: now.toISOString(),
    purpose: "Forward-only V7 evaluation of ACCUMULA_A_TRANCHE_SHADOW versus WAIT. No historical backfill.",
    methodology: {
      forwardOnly: true,
      historicalBackfillAllowed: false,
      trancheOffsetsDays: TRANCHE_TARGETS.map((item) => item.targetOffsetDays),
      trancheCount: 3,
      trancheSizing: "equal notional research tranches; no euro amount is assigned",
      laterTranchesRequireCurrentShadowEligibility: true,
      checkpoints: CHECKPOINTS.map((item) => ({ label: item.label, targetOffsetDays: item.targetOffsetDays })),
      waitBaselineReturnPercent: 0,
      neutralBandPercent: 0.5,
      sourceFreshnessHours: 26,
    },
    isolation: {
      modifiesV6DecisionPolicy: false,
      queueWritesAllowed: false,
      paperCertificationEvidenceMutationAllowed: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
      feedsProposalReadiness: false,
    },
    sourceState: {
      sourceFresh,
      horizonGeneratedAt: horizonReport?.generatedAt ?? null,
      committeeGeneratedAt: committee?.generatedAt ?? null,
      selectedNow: selected.map((candidate) => candidate.symbol),
    },
    recordCount: capped.length,
    records: capped,
  };
}

export function summarizeForwardShadowLedger(records, checkpointLabel) {
  const rows = (Array.isArray(records) ? records : [])
    .map((record) => ({ record, checkpoint: record?.checkpoints?.[checkpointLabel] }))
    .filter(({ checkpoint }) => checkpoint?.status === "MEASURED" && finite(checkpoint?.stagedReturnPercent));

  const returns = rows.map(({ checkpoint }) => Number(checkpoint.stagedReturnPercent));
  const stagedVsLump = rows.map(({ checkpoint }) => Number(checkpoint.stagedVsLumpPercent)).filter(finite);
  const drawdowns = rows.map(({ checkpoint }) => Number(checkpoint.worstObservedStagedReturnPercent)).filter(finite);
  const beats = rows.filter(({ checkpoint }) => checkpoint.resultVsWait === "BEATS_WAIT").length;
  const lags = rows.filter(({ checkpoint }) => checkpoint.resultVsWait === "LAGS_WAIT").length;
  const neutral = rows.filter(({ checkpoint }) => checkpoint.resultVsWait === "NEUTRAL_VS_WAIT").length;

  return {
    checkpoint: checkpointLabel,
    sampleSize: rows.length,
    averageStagedReturnPercent: returns.length ? round(returns.reduce((a, b) => a + b, 0) / returns.length) : null,
    medianStagedReturnPercent: returns.length
      ? round([...returns].sort((a, b) => a - b)[Math.floor(returns.length / 2)])
      : null,
    beatWaitRatePercent: rows.length ? round((beats / rows.length) * 100) : null,
    lagWaitRatePercent: rows.length ? round((lags / rows.length) * 100) : null,
    neutralRatePercent: rows.length ? round((neutral / rows.length) * 100) : null,
    averageStagedVsLumpPercent: stagedVsLump.length
      ? round(stagedVsLump.reduce((a, b) => a + b, 0) / stagedVsLump.length)
      : null,
    averageWorstObservedReturnPercent: drawdowns.length
      ? round(drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length)
      : null,
    maturity: rows.length >= 30 ? "MATURE" : rows.length >= 10 ? "EARLY" : "INSUFFICIENT",
  };
}
