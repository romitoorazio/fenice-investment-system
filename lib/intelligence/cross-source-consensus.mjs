import { isCryptoAssetClass, normalizeEvidenceSymbol } from "./quality-engine.mjs";

function spreadPercent(prices) {
  const finite = (prices || []).map(Number).filter(Number.isFinite);
  if (finite.length < 2) return 0;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const midpoint = (min + max) / 2 || 1;
  return ((max - min) / midpoint) * 100;
}

function groupedByInstrument(observations) {
  const groups = new Map();
  for (const item of observations || []) {
    const symbol = normalizeEvidenceSymbol(item?.symbol);
    const currency = String(item?.currency || "").trim().toUpperCase();
    if (!symbol || !currency || !item?.source || !Number.isFinite(Number(item?.price))) continue;
    const key = `${symbol}:${currency}`;
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function latestBySource(items) {
  const bySource = new Map();
  for (const item of items || []) {
    const source = String(item?.source || "").trim();
    if (!source) continue;
    const existing = bySource.get(source);
    const candidateAt = Date.parse(String(item?.observedAt || ""));
    const existingAt = Date.parse(String(existing?.observedAt || ""));
    if (!existing || (Number.isFinite(candidateAt) && (!Number.isFinite(existingAt) || candidateAt >= existingAt))) {
      bySource.set(source, item);
    }
  }
  return [...bySource.values()];
}

function strictMajorityConsensus(independent, confirmSpreadPercent) {
  const ordered = [...independent].sort((a, b) => Number(a.price) - Number(b.price));
  const required = Math.floor(ordered.length / 2) + 1;
  let best = [];
  for (let start = 0; start < ordered.length; start += 1) {
    for (let end = start; end < ordered.length; end += 1) {
      const candidate = ordered.slice(start, end + 1);
      if (spreadPercent(candidate.map((item) => item.price)) <= confirmSpreadPercent && candidate.length > best.length) {
        best = candidate;
      }
    }
  }
  return best.length >= required ? best : [];
}

function confidenceCreditForValidation({
  status,
  overallSpread,
  consensus,
  confirmSpreadPercent,
  divergenceSpreadPercent,
}) {
  if (status === "confermato") return 1;
  if (status === "divergente") return 0;
  if (status !== "attenzione") return 0;

  // A strict independent majority inside the confirmation band is strong
  // validation evidence as long as the full observed range itself has not
  // crossed the divergence boundary. The outlier remains explicit and the
  // check remains labelled ATTENTION; this only prevents the confidence model
  // from treating majority consensus exactly like unresolved disagreement.
  if (consensus.length && overallSpread <= divergenceSpreadPercent) return 1;

  // Ordinary ATTENTION evidence is graded continuously between the existing
  // confirmation and divergence bands. This removes a cliff at the boundary
  // without moving either threshold. Evidence at the divergence boundary gets
  // zero credit; evidence immediately outside confirmation gets almost full
  // credit. Missing/invalid policy values fail closed to zero.
  const width = Number(divergenceSpreadPercent) - Number(confirmSpreadPercent);
  if (!Number.isFinite(overallSpread) || !Number.isFinite(width) || width <= 0) return 0;
  return Math.min(1, Math.max(0, (Number(divergenceSpreadPercent) - overallSpread) / width));
}

export function buildCrossSourceValidation(
  observations,
  { confirmSpreadPercent = 0.5, divergenceSpreadPercent = 2 } = {},
) {
  const checks = [];
  for (const [instrument, items] of groupedByInstrument(observations)) {
    const independent = latestBySource(items);
    if (independent.length < 2) continue;

    const overallSpread = spreadPercent(independent.map((item) => item.price));
    let status = overallSpread <= confirmSpreadPercent
      ? "confermato"
      : overallSpread <= divergenceSpreadPercent
        ? "attenzione"
        : "divergente";
    let consensus = [];

    if (overallSpread > confirmSpreadPercent && independent.length >= 3) {
      consensus = strictMajorityConsensus(independent, confirmSpreadPercent);
      if (consensus.length) status = "attenzione";
    }

    const consensusSources = new Set(consensus.map((item) => item.source));
    const confidenceCredit = confidenceCreditForValidation({
      status,
      overallSpread,
      consensus,
      confirmSpreadPercent,
      divergenceSpreadPercent,
    });
    checks.push({
      instrument,
      sources: independent.map((item) => item.source),
      observations: independent.length,
      spreadPercent: Number(overallSpread.toFixed(3)),
      status,
      confidenceCredit: Number(confidenceCredit.toFixed(3)),
      confirmationBandPercent: Number(confirmSpreadPercent),
      divergenceBandPercent: Number(divergenceSpreadPercent),
      ...(consensus.length ? {
        consensusSources: [...consensusSources],
        outlierSources: independent.filter((item) => !consensusSources.has(item.source)).map((item) => item.source),
        consensusSpreadPercent: Number(spreadPercent(consensus.map((item) => item.price)).toFixed(3)),
        consensusRule: "strict-majority-within-confirmation-band",
      } : {}),
    });
  }
  return checks.sort((a, b) => b.spreadPercent - a.spreadPercent);
}

export function deriveCryptoConflictEscalationTargets(
  observations,
  { limit = 4, divergenceSpreadPercent = 2 } = {},
) {
  const targets = [];
  for (const [, items] of groupedByInstrument(observations)) {
    const independent = latestBySource(items);
    if (independent.length !== 2) continue;
    if (!independent.some((item) => isCryptoAssetClass(item?.assetClass))) continue;
    if (spreadPercent(independent.map((item) => item.price)) <= divergenceSpreadPercent) continue;
    const sample = independent.find((item) => isCryptoAssetClass(item?.assetClass)) || independent[0];
    const symbol = normalizeEvidenceSymbol(sample?.symbol);
    if (!symbol || symbol.length > 12) continue;
    targets.push({
      symbol,
      name: sample?.name || symbol,
      currency: String(sample?.currency || "USD").toUpperCase(),
      existingSources: independent.map((item) => item.source),
      spreadPercent: Number(spreadPercent(independent.map((item) => item.price)).toFixed(3)),
    });
  }
  return targets
    .sort((a, b) => b.spreadPercent - a.spreadPercent || a.symbol.localeCompare(b.symbol))
    .slice(0, Math.max(0, Number(limit) || 0));
}

export function mergeEvidenceBySource(baseObservations, additions) {
  const unique = new Map();
  for (const item of [...(baseObservations || []), ...(additions || [])]) {
    const symbol = normalizeEvidenceSymbol(item?.symbol);
    const currency = String(item?.currency || "USD").trim().toUpperCase();
    const source = String(item?.source || "").trim();
    if (!symbol || !source || !Number.isFinite(Number(item?.price))) continue;
    const key = `${symbol}:${currency}:${source}`;
    const existing = unique.get(key);
    const candidateAt = Date.parse(String(item?.observedAt || ""));
    const existingAt = Date.parse(String(existing?.observedAt || ""));
    if (!existing || (Number.isFinite(candidateAt) && (!Number.isFinite(existingAt) || candidateAt >= existingAt))) {
      unique.set(key, item);
    }
  }
  return [...unique.values()];
}
