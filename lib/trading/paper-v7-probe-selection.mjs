function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

export function uniquePaperV7Symbols(values) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const symbol = normalizeSymbol(value);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    result.push(symbol);
  }
  return result;
}

export function selectPaperV7ProbeSymbols({
  baseSymbols,
  promotionSymbols,
  allowedUniverse,
  maxBatchSymbols = 8,
}) {
  const ceiling = Math.max(1, Math.min(8, Number(maxBatchSymbols) || 8));
  const base = uniquePaperV7Symbols(baseSymbols);
  const promotions = uniquePaperV7Symbols(promotionSymbols);
  const universe = uniquePaperV7Symbols(allowedUniverse);
  const universeSet = new Set(universe);
  const baseSet = new Set(base);

  const missingBaseSymbols = base.filter((symbol) => !universeSet.has(symbol));
  if (missingBaseSymbols.length) {
    throw new Error(`PAPER_V7_BASE_OUTSIDE_ALLOWED_UNIVERSE:${missingBaseSymbols.join(",")}`);
  }
  if (base.length > ceiling) {
    throw new Error(`PAPER_V7_BASE_EXCEEDS_BATCH_CEILING:${base.length}>${ceiling}`);
  }

  const missingPromotions = promotions.filter((symbol) => !universeSet.has(symbol));
  const eligiblePromotions = promotions.filter((symbol) => universeSet.has(symbol) && !baseSet.has(symbol));
  const promotionSlots = Math.max(0, ceiling - base.length);
  const includedPromotions = eligiblePromotions.slice(0, promotionSlots);
  const deferredByCeiling = eligiblePromotions.slice(promotionSlots);
  const selectedSymbols = [...base, ...includedPromotions];

  return {
    maxBatchSymbols: ceiling,
    baseSymbols: base,
    requestedPromotions: promotions,
    selectedSymbols,
    includedPromotions,
    deferredByCeiling,
    missingPromotions,
    promotionSlots,
    additionalBatchCredits: includedPromotions.length,
  };
}
