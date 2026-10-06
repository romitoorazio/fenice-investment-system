const BUY_POLICY = Object.freeze({
  minimumCommitteeScore: 78,
  minimumConfidence: 72,
  maximumRiskScore: 58,
  minimumValuationScore: 55,
});

const DAY_MS = 86_400_000;
const finite = (value) => Number.isFinite(Number(value));
const numberOrNull = (value) => finite(value) ? Number(value) : null;
const round = (value, digits = 2) => {
  if (!finite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};

function buyReadiness(item) {
  const score = Number(item?.committeeScore || 0);
  const rawConfidence = Number(item?.rawConfidenceBeforeCalibration || 0);
  const calibratedConfidence = Number(item?.confidence || 0);
  const risk = Number(item?.riskScore || 100);
  const valuation = Number(item?.scorecard?.valuation || 0);
  const terminalDecision = String(item?.terminalDecision || "").toUpperCase();
  const deepOvervaluation = String(item?.valuation?.status || "").toLowerCase() === "disponibile"
    && finite(item?.valuation?.upsideBasePercent)
    && Number(item.valuation.upsideBasePercent) < -25;

  const gates = {
    committeeScore: score >= BUY_POLICY.minimumCommitteeScore,
    rawConfidence: rawConfidence >= BUY_POLICY.minimumConfidence,
    calibratedConfidence: calibratedConfidence >= BUY_POLICY.minimumConfidence,
    risk: risk <= BUY_POLICY.maximumRiskScore,
    valuation: valuation >= BUY_POLICY.minimumValuationScore,
    terminalAccumula: terminalDecision === "ACCUMULA",
    deepOvervaluation: !deepOvervaluation,
  };

  return {
    ...gates,
    scoreGap: Math.max(0, BUY_POLICY.minimumCommitteeScore - score),
    valuationGap: Math.max(0, BUY_POLICY.minimumValuationScore - valuation),
    calibrationPenaltyPoints: Math.max(0, rawConfidence - calibratedConfidence),
    blockedOnlyByCalibration: gates.committeeScore
      && gates.rawConfidence
      && !gates.calibratedConfidence
      && gates.risk
      && gates.valuation
      && gates.terminalAccumula
      && gates.deepOvervaluation,
    wouldMeetCommitteeBuyUsingRawConfidence: gates.committeeScore
      && gates.rawConfidence
      && gates.risk
      && gates.valuation
      && gates.terminalAccumula
      && gates.deepOvervaluation,
  };
}

export function selectShadowCalibrationCandidates(decisions, {
  minimumCommitteeScore = 68,
  minimumRawConfidence = 90,
  maximumRiskScore = 68,
  limit = 12,
} = {}) {
  const source = Array.isArray(decisions) ? decisions : [];
  return source
    .filter((item) => ["OSSERVA", "ATTENDI"].includes(String(item?.decision || "").toUpperCase()))
    .filter((item) => String(item?.terminalDecision || "").toUpperCase() === "ACCUMULA")
    .filter((item) => Number(item?.committeeScore) >= minimumCommitteeScore)
    .filter((item) => Number(item?.rawConfidenceBeforeCalibration) >= minimumRawConfidence)
    .filter((item) => Number(item?.riskScore) <= maximumRiskScore)
    .sort((a, b) =>
      Number(b.rawConfidenceBeforeCalibration || 0) - Number(a.rawConfidenceBeforeCalibration || 0)
      || Number(b.committeeScore || 0) - Number(a.committeeScore || 0)
      || Number(a.riskScore || 100) - Number(b.riskScore || 100))
    .slice(0, Math.max(0, Math.min(50, Number(limit) || 0)))
    .map((item) => ({
      symbol: String(item.symbol || "").toUpperCase(),
      observedDecision: item.decision,
      terminalDecision: item.terminalDecision,
      committeeScore: Number(item.committeeScore),
      rawConfidence: Number(item.rawConfidenceBeforeCalibration),
      calibratedConfidence: Number(item.confidence),
      riskScore: Number(item.riskScore),
      valuationScore: Number(item?.scorecard?.valuation || 0),
      referencePrice: numberOrNull(item.currentPrice),
      currency: item.currency || null,
      readiness: buyReadiness(item),
      researchOnly: true,
      calibrationOnly: false,
      executionEligible: false,
      paperCertificationEligible: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
    }));
}

function ageDays(createdAt, now) {
  const created = Date.parse(String(createdAt || ""));
  const current = now.getTime();
  if (!Number.isFinite(created) || !Number.isFinite(current)) return 0;
  return Math.max(0, (current - created) / DAY_MS);
}

function checkpointPayload(referencePrice, currentPrice, measuredAt, source = "current-committee") {
  return {
    measuredAt,
    price: round(currentPrice),
    returnPercent: round(((Number(currentPrice) - Number(referencePrice)) / Number(referencePrice)) * 100),
    source,
  };
}

function addCheckpoint(record, label, minimumDays, currentPrice, now, maximumDelayDays = 4) {
  if (record.checkpoints?.[label]) return;
  const age = ageDays(record.createdAt, now);
  if (age < minimumDays || age > minimumDays + maximumDelayDays) return;
  if (!finite(currentPrice) || !finite(record.referencePrice) || Number(record.referencePrice) <= 0) return;
  record.checkpoints ??= {};
  record.checkpoints[label] = checkpointPayload(record.referencePrice, currentPrice, now.toISOString());
}

function safeDailyHistory(snapshots) {
  const latestByDay = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const generatedAt = String(snapshot?.generatedAt || "");
    const timestamp = Date.parse(generatedAt);
    if (!Number.isFinite(timestamp)) continue;
    const date = generatedAt.slice(0, 10);
    const weekday = new Date(timestamp).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const current = latestByDay.get(date);
    if (!current || timestamp > current.timestamp) {
      latestByDay.set(date, { snapshot, timestamp, date });
    }
  }
  return [...latestByDay.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function priceFromSnapshot(snapshot, symbol) {
  const row = (Array.isArray(snapshot?.allDecisions) ? snapshot.allDecisions : [])
    .find((item) => String(item?.symbol || "").toUpperCase() === String(symbol || "").toUpperCase());
  return finite(row?.currentPrice) && Number(row.currentPrice) > 0 ? Number(row.currentPrice) : null;
}

function historicalCheckpoint(record, label, horizonDays, dailyHistory, maxDelayDays) {
  const origin = Date.parse(String(record.createdAt || ""));
  if (!Number.isFinite(origin) || !finite(record.referencePrice) || Number(record.referencePrice) <= 0) return null;
  const target = origin + horizonDays * DAY_MS;
  const latest = target + Math.max(0, Number(maxDelayDays) || 0) * DAY_MS;
  for (const row of dailyHistory) {
    if (row.timestamp < target) continue;
    if (row.timestamp > latest) break;
    const price = priceFromSnapshot(row.snapshot, record.symbol);
    if (!finite(price)) continue;
    return checkpointPayload(record.referencePrice, price, row.snapshot.generatedAt, "committee-history");
  }
  return null;
}

export function buildHistoricalShadowBackfill(snapshots, {
  maxRecords = 5000,
  maxCheckpointDelayDays = 4,
} = {}) {
  const dailyHistory = safeDailyHistory(snapshots);
  const records = [];

  for (const row of dailyHistory) {
    const candidates = selectShadowCalibrationCandidates(row.snapshot?.allDecisions || []);
    for (const candidate of candidates) {
      if (!finite(candidate.referencePrice) || Number(candidate.referencePrice) <= 0) continue;
      records.push({
        id: `${row.date}:${candidate.symbol}`,
        cycleId: row.snapshot.generatedAt,
        observationDate: row.date,
        createdAt: row.snapshot.generatedAt,
        symbol: candidate.symbol,
        researchSignal: "ACCUMULA_SHADOW",
        observedDecision: candidate.observedDecision,
        terminalDecision: candidate.terminalDecision,
        committeeScore: candidate.committeeScore,
        rawConfidence: candidate.rawConfidence,
        calibratedConfidence: candidate.calibratedConfidence,
        riskScore: candidate.riskScore,
        valuationScore: candidate.valuationScore,
        readiness: candidate.readiness,
        referencePrice: round(candidate.referencePrice),
        currency: candidate.currency,
        lastPrice: round(candidate.referencePrice),
        lastMarkedAt: row.snapshot.generatedAt,
        markToMarketPercent: 0,
        checkpoints: {},
        historicalBackfill: true,
        historicalSource: "data/committee-history",
        researchOnly: true,
        executionEligible: false,
        paperCertificationEligible: false,
        brokerSubmissionAllowed: false,
        liveTradingAllowed: false,
      });
    }
  }

  for (const record of records) {
    for (const [label, days] of [["1d", 1], ["7d", 7], ["30d", 30], ["90d", 90]]) {
      const checkpoint = historicalCheckpoint(record, label, days, dailyHistory, maxCheckpointDelayDays);
      if (checkpoint) record.checkpoints[label] = checkpoint;
    }
    const checkpointEntries = Object.values(record.checkpoints || {})
      .filter((item) => finite(item?.price) && Number.isFinite(Date.parse(String(item?.measuredAt || ""))))
      .sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
    const latest = checkpointEntries.at(-1);
    if (latest) {
      record.lastPrice = latest.price;
      record.lastMarkedAt = latest.measuredAt;
      record.markToMarketPercent = round(((Number(latest.price) - Number(record.referencePrice)) / Number(record.referencePrice)) * 100);
    }
  }

  const capped = records
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.symbol.localeCompare(b.symbol))
    .slice(-Math.max(1, Math.min(50_000, Number(maxRecords) || 5000)));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    purpose: "Historical research-only bootstrap from persisted committee snapshots with comparable raw-confidence fields.",
    methodology: {
      oneObservationPerSymbolPerUtcWeekday: true,
      weekendsExcluded: true,
      requiresRawConfidenceBeforeCalibration: true,
      checkpointSource: "committee-history",
      maxCheckpointDelayDays,
      feedsV6CalibrationPolicy: false,
    },
    isolation: {
      modifiesV6DecisionLedger: false,
      executionEligible: false,
      paperCertificationEligible: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
    },
    recordCount: capped.length,
    records: capped,
  };
}

export function updateShadowCalibrationLedger(previous, candidates, priceBySymbol, {
  cycleId,
  now = new Date(),
  maxRecords = 5000,
} = {}) {
  const records = structuredClone(Array.isArray(previous?.records) ? previous.records : []);
  const prices = priceBySymbol instanceof Map ? priceBySymbol : new Map();
  const timestamp = now.toISOString();

  for (const record of records) {
    const currentPrice = prices.get(String(record.symbol || "").toUpperCase());
    if (!finite(currentPrice)) continue;
    record.lastPrice = round(currentPrice);
    record.lastMarkedAt = timestamp;
    record.markToMarketPercent = finite(record.referencePrice) && Number(record.referencePrice) > 0
      ? round(((Number(currentPrice) - Number(record.referencePrice)) / Number(record.referencePrice)) * 100)
      : null;
    addCheckpoint(record, "1d", 1, currentPrice, now);
    addCheckpoint(record, "7d", 7, currentPrice, now);
    addCheckpoint(record, "30d", 30, currentPrice, now);
    addCheckpoint(record, "90d", 90, currentPrice, now);
  }

  const observationDate = timestamp.slice(0, 10);
  const existing = new Set(records.map((record) => String(record.id || "")));
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const id = `${observationDate}:${candidate.symbol}`;
    if (existing.has(id) || !finite(candidate.referencePrice) || Number(candidate.referencePrice) <= 0) continue;
    records.push({
      id,
      cycleId: cycleId || timestamp,
      observationDate,
      createdAt: timestamp,
      symbol: candidate.symbol,
      researchSignal: "ACCUMULA_SHADOW",
      observedDecision: candidate.observedDecision,
      terminalDecision: candidate.terminalDecision,
      committeeScore: candidate.committeeScore,
      rawConfidence: candidate.rawConfidence,
      calibratedConfidence: candidate.calibratedConfidence,
      riskScore: candidate.riskScore,
      valuationScore: candidate.valuationScore,
      readiness: candidate.readiness,
      referencePrice: round(candidate.referencePrice),
      currency: candidate.currency,
      lastPrice: round(candidate.referencePrice),
      lastMarkedAt: timestamp,
      markToMarketPercent: 0,
      checkpoints: {},
      historicalBackfill: false,
      researchOnly: true,
      executionEligible: false,
      paperCertificationEligible: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
    });
    existing.add(id);
  }

  const capped = records.slice(-Math.max(1, Math.min(50_000, Number(maxRecords) || 5000)));
  return {
    version: 1,
    generatedAt: timestamp,
    purpose: "Research-only longitudinal shadow ledger. Never consumed as V6 PAPER certification evidence.",
    isolation: {
      modifiesV6DecisionLedger: false,
      executionEligible: false,
      paperCertificationEligible: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
    },
    recordCount: capped.length,
    records: capped,
  };
}

export function buildShadowOutcomeSamples(records, checkpoint) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => finite(record?.rawConfidence) && finite(record?.checkpoints?.[checkpoint]?.returnPercent))
    .map((record) => ({
      confidence: Math.min(1, Math.max(0, Number(record.rawConfidence) / 100)),
      outcome: Number(record.checkpoints[checkpoint].returnPercent) > 0 ? 1 : 0,
    }));
}
