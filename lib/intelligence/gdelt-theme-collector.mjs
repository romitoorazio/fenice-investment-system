/**
 * Serial, budget-bounded primary news collection. A 403/429/503 response
 * opens a same-run circuit: remaining themes use discovery-only RSS without
 * making more requests to the rate-limited provider.
 * Research only: neither output can authorize PAPER or LIVE trading.
 */
export async function collectThemesWithCircuit(themes, { fetchPrimary, fetchFallback, isProviderBlocked }) {
  if (!Array.isArray(themes) || [fetchPrimary, fetchFallback, isProviderBlocked].some(fn => typeof fn !== "function")) {
    throw new TypeError("Invalid bounded news collector inputs");
  }
  let circuitOpen = false;
  let skippedPrimary = 0;
  const results = [];
  for (const theme of themes) {
    let primaryError = null;
    if (!circuitOpen) {
      try {
        const items = await fetchPrimary(theme);
        results.push({ status: "fulfilled", value: { items, primary: true, primaryError: null } });
        continue;
      } catch (error) {
        primaryError = error;
        if (isProviderBlocked(error)) circuitOpen = true;
      }
    } else {
      skippedPrimary += 1;
      primaryError = new Error("GDELT circuit open after provider rate/access refusal");
    }
    try {
      const items = await fetchFallback(theme);
      results.push({ status: "fulfilled", value: {
        items, primary: false,
        primaryError: primaryError instanceof Error ? primaryError.message : String(primaryError),
      } });
    } catch (fallbackError) {
      const error = new Error("Primary news unavailable; RSS fallback unavailable");
      error.cause = { primaryError, fallbackError };
      results.push({ status: "rejected", reason: error });
    }
  }
  return { results, circuitOpen, skippedPrimary };
}
