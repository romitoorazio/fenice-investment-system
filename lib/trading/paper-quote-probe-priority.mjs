/** Rank only provider probes; never change trading decisions or PAPER evidence eligibility. */
export function prioritizeMissingSecondSource(candidates, observations, nowMs = Date.now(), maxAgeMs = 120_000) {
  const families = new Map();
  for (const item of observations || []) {
    if (item?.eligibility !== "PAPER" || !["alpaca", "twelve-data"].includes(item.sourceFamily)) continue;
    const at = Date.parse(item.observedAt);
    if (!Number.isFinite(at) || nowMs - at < 0 || nowMs - at > maxAgeMs) continue;
    const symbol = String(item.symbol || "").trim().toUpperCase();
    if (!families.has(symbol)) families.set(symbol, new Set());
    families.get(symbol).add(item.sourceFamily);
  }
  return candidates.map((instrument, index) => ({ instrument, index }))
    .sort((a, b) => {
      const priority = item => {
        const sources = families.get(String(item.instrument.symbol || "").trim().toUpperCase());
        if (sources?.has("alpaca") && !sources.has("twelve-data")) return 0;
        if (!sources?.has("twelve-data")) return 1;
        return 2;
      };
      return priority(a) - priority(b) || a.index - b.index;
    }).map(({ instrument }) => instrument);
}
