const BUY_POLICY = Object.freeze({
  minimumCommitteeScore: 78,
  minimumConfidence: 72,
  maximumRiskScore: 58,
  minimumValuationScore: 55,
});

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
  return Math.max(0, (current - created) / 86_400_000);
}

function addCheckpoint(record, label, minimumDays, currentPrice, now) {
  if (record.checkpoints?.[label]) return;
  if (ageDays(record.createdAt, now) < minimumDays) return;
  if (!finite(currentPrice) || !finite(record.referencePrice) || Number(record.referencePrice) <= 0) return;
  record.checkpoints ??= {};
  record.checkpoints[label] = {
    measuredAt: now.toISOString(),
    price: round(currentPrice),
    returnPercent: round(((Number(currentPrice) - Number(record.referencePrice)) / Number(record.referencePrice)) * 100),
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
