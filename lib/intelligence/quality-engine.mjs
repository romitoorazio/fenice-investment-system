const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export function normalizeEvidenceSymbol(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "");
}

export function isCryptoAssetClass(value) {
  return /crypto|criptovaluta/i.test(String(value || ""));
}

export function deriveCryptoVenueTargets(observations, limit = 12) {
  const candidates = new Map();
  for (const item of observations || []) {
    if (!isCryptoAssetClass(item?.assetClass)) continue;
    const symbol = normalizeEvidenceSymbol(item?.symbol);
    if (!symbol || symbol.length > 12) continue;
    if (!candidates.has(symbol)) candidates.set(symbol, [symbol, item?.name || symbol]);
  }

  const priority = ["BTC", "ETH"];
  return [...candidates.values()]
    .sort((a, b) => {
      const ai = priority.indexOf(a[0]);
      const bi = priority.indexOf(b[0]);
      if (ai >= 0 || bi >= 0) {
        if (ai < 0) return 1;
        if (bi < 0) return -1;
        return ai - bi;
      }
      return a[0].localeCompare(b[0]);
    })
    .slice(0, Math.max(0, limit));
}

export function deriveStooqTargets(observations, seedUniverse = [], limit = 32) {
  const targets = new Map();
  for (const [code, symbol, assetClass] of seedUniverse || []) {
    const normalized = normalizeEvidenceSymbol(symbol);
    if (normalized) targets.set(normalized, [code, normalized, assetClass]);
  }

  for (const item of observations || []) {
    if (isCryptoAssetClass(item?.assetClass)) continue;
    const symbol = normalizeEvidenceSymbol(item?.symbol);
    if (!symbol || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) || targets.has(symbol)) continue;
    const currency = String(item?.currency || "USD").toUpperCase();
    if (currency !== "USD") continue;
    targets.set(symbol, [`${symbol.toLowerCase()}.us`, symbol, item?.assetClass || "Mercato"]);
  }

  return [...targets.values()].slice(0, Math.max(0, limit));
}

export async function settleWithConcurrency(taskFactories, concurrency = 8) {
  const tasks = Array.isArray(taskFactories) ? taskFactories : [];
  const limit = Math.max(1, Math.min(16, Number(concurrency) || 1));
  const results = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length || 1) }, () => worker()));
  return results;
}

export function computeSourceConcentration(observations) {
  const rows = Array.isArray(observations) ? observations.filter((item) => item?.source) : [];
  if (!rows.length) return 1;
  const counts = new Map();
  for (const row of rows) counts.set(row.source, (counts.get(row.source) || 0) + 1);
  return Math.max(...counts.values()) / rows.length;
}

function hasPreciseTimestamp(value) {
  const text = String(value || "").trim();
  if (!text || /^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  return /T\d{2}:\d{2}/.test(text);
}

export function filterFreshValidationEvidence(
  observations,
  {
    now = Date.now(),
    cryptoMaxAgeHours = 4,
    traditionalMaxAgeHours = 96,
    requirePreciseTimestamp = true,
  } = {},
) {
  const rows = Array.isArray(observations) ? observations : [];
  return rows.filter((item) => {
    if (requirePreciseTimestamp && !hasPreciseTimestamp(item?.observedAt)) return false;
    const observedAt = Date.parse(String(item?.observedAt || ""));
    if (!Number.isFinite(observedAt)) return false;
    const ageHours = (Number(now) - observedAt) / 3_600_000;
    if (!Number.isFinite(ageHours) || ageHours < 0) return false;
    const maxAge = isCryptoAssetClass(item?.assetClass)
      ? Math.max(0, Number(cryptoMaxAgeHours) || 4)
      : Math.max(0, Number(traditionalMaxAgeHours) || 96);
    return ageHours <= maxAge;
  });
}

export function computeIntelligenceConfidence({
  sourceQuality = [],
  criticalHealth = {},
  healthReportGeneratedAt = null,
  validations = [],
  sourceCount = 0,
  assetClassCount = 0,
  concentration = 1,
  now = Date.now(),
  maxCriticalHealthAgeHours = 24,
}) {
  const active = sourceQuality.filter((item) => item?.state === "operativo" || item?.state === "parziale");
  const activeAverageQuality = active.length
    ? active.reduce((sum, item) => sum + Number(item?.qualityScore || 0), 0) / active.length
    : 0;

  const totalCritical = Number(criticalHealth?.total || 0);
  const readyCritical = Number(criticalHealth?.ready || 0);
  const criticalRatio = totalCritical > 0 ? clamp(readyCritical / totalCritical, 0, 1) : 0;
  const healthGeneratedAtMs = Date.parse(String(healthReportGeneratedAt || ""));
  const criticalHealthAgeHours = Number.isFinite(healthGeneratedAtMs)
    ? Math.max(0, (Number(now) - healthGeneratedAtMs) / 3_600_000)
    : Number.POSITIVE_INFINITY;
  const criticalHealthFresh = Number.isFinite(criticalHealthAgeHours)
    && criticalHealthAgeHours <= Math.max(0, Number(maxCriticalHealthAgeHours) || 24);
  const criticalGreen = criticalHealth?.gate === "GREEN"
    && totalCritical > 0
    && readyCritical === totalCritical
    && criticalHealthFresh;

  const checked = validations.length;
  const confirmed = validations.filter((item) => item?.status === "confermato").length;
  const divergent = validations.filter((item) => item?.status === "divergente").length;
  const confirmedRatio = checked > 0 ? confirmed / checked : 0;
  const depth = clamp(checked / 10, 0, 1);
  const failedProviders = sourceQuality.filter((item) => item?.state === "errore").length;

  const concentrationPenalty = concentration > 0.5 ? Math.min(12, (concentration - 0.5) * 40) : 0;
  const divergencePenalty = Math.min(30, divergent * 6);
  const optionalFailurePenalty = Math.min(8, failedProviders * 2);

  const components = {
    activeSourceQuality: activeAverageQuality * 0.4,
    criticalSources: 25 * criticalRatio,
    crossValidation: 20 * confirmedRatio * depth,
    sourceDiversity: 8 * clamp(sourceCount / 4, 0, 1),
    assetClassDiversity: 7 * clamp(assetClassCount / 4, 0, 1),
    concentrationPenalty,
    divergencePenalty,
    optionalFailurePenalty,
  };

  let score = components.activeSourceQuality
    + components.criticalSources
    + components.crossValidation
    + components.sourceDiversity
    + components.assetClassDiversity
    - components.concentrationPenalty
    - components.divergencePenalty
    - components.optionalFailurePenalty;

  // Fail-closed confidence caps: no score can hide missing, stale or divergent evidence.
  if (!criticalGreen) score = Math.min(score, 74);
  if (checked < 3) score = Math.min(score, 69);
  if (divergent > 0) score = Math.min(score, 84);
  if (sourceCount < 2) score = Math.min(score, 64);

  return {
    confidence: Math.round(clamp(score)),
    components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, Number(value.toFixed(2))])),
    metrics: {
      activeAverageQuality: Number(activeAverageQuality.toFixed(2)),
      criticalGreen,
      criticalHealthFresh,
      criticalHealthAgeHours: Number.isFinite(criticalHealthAgeHours) ? Number(criticalHealthAgeHours.toFixed(2)) : null,
      criticalReady: readyCritical,
      criticalTotal: totalCritical,
      checked,
      confirmed,
      divergent,
      sourceCount,
      assetClassCount,
      concentrationPercent: Number((concentration * 100).toFixed(2)),
    },
  };
}
