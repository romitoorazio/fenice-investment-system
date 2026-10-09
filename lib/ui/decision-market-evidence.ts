/**
 * Read-only decision screen data-quality labels. Research scores are not an
 * authorization to buy or sell, and historic PAPER evidence is not a quote feed.
 */
export type DecisionInstrument = {
  ticker?: string; status?: string; currency?: string;
  exchangeMic?: string | null; assetClass?: string;
};
export type DecisionQuoteDiagnostic = {
  symbol?: string;
  state?: string;
  snapshotPaperEligible?: boolean;
  freshVerifiedFamilies?: string[];
  historicalVerifiedFamilies?: string[];
  quoteCurrencies?: string[];
  newestQuoteAgeSeconds?: number | null;
};
export type DecisionVenue = {
  state?: string;
  authoritative?: boolean;
  paperQuoteRefreshCandidate?: boolean;
};
export type DecisionEvidenceInput = {
  symbol: string;
  researchCurrency?: string | null;
  researchFresh: boolean;
  instruments: DecisionInstrument[];
  quote: DecisionQuoteDiagnostic | null | undefined;
  quoteSnapshotCurrent: boolean;
  quoteGateReady: boolean;
  venue: DecisionVenue | null | undefined;
};
export function assessDecisionEvidence(input: DecisionEvidenceInput) {
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const matched = input.instruments.filter((row) =>
    row.status === "active" && String(row.ticker || "").trim().toUpperCase() === symbol);
  const instrument = matched.length === 1 ? matched[0] : null;
  const mic = instrument?.exchangeMic ?? null;
  const modelCurrency = String(input.researchCurrency || "").trim().toUpperCase();
  const instrumentCurrency = String(instrument?.currency || "").trim().toUpperCase();
  const currencyMatch = !!modelCurrency && modelCurrency === instrumentCurrency;
  const marketStatus = !instrument ? "Titolo non identificato univocamente nel nucleo pilota"
    : !mic ? "Borsa non associata allo strumento"
    : input.venue?.authoritative !== true ? "Borsa: apertura non verificata"
    : input.venue.state === "CLOSED" ? "Borsa: chiusa (verificato)"
    : input.venue.state === "OPEN" ? "Borsa: aperta (orologio verificato)"
    : "Borsa: stato non verificato";
  const quote = input.quote;
  const quoteCurrencies = quote?.quoteCurrencies ?? [];
  const observedCurrenciesMatch = quoteCurrencies.length === 1 && quoteCurrencies[0] === instrumentCurrency;
  const validatedSources = quote?.freshVerifiedFamilies?.length ?? 0;
  let priceStatus: string;
  if (!input.researchFresh) priceStatus = "Ricerca giornaliera scaduta";
  else if (!instrument) priceStatus = "Identità strumento non verificata";
  else if (!currencyMatch) priceStatus = "Valuta del modello diversa dal titolo censito";
  else if (instrument.assetClass !== "equity" && instrument.assetClass !== "etf") priceStatus = "Prezzi PAPER non certificati per questa classe";
  else if (!input.quoteSnapshotCurrent) priceStatus = "Quotazioni PAPER archiviate: campione scaduto";
  else if (!quote) priceStatus = "Nessuna evidenza PAPER per questo titolo";
  else if (quote.state === "CURRENCY_NOT_VERIFIED" || !observedCurrenciesMatch) priceStatus = "Valute PAPER mancanti o incoerenti";
  else if (validatedSources < 2 || !quote.snapshotPaperEligible) priceStatus = "Mancano almeno due fonti PAPER recenti certificate";
  else if (!input.quoteGateReady) priceStatus = "Quorum complessivo PAPER non verificato";
  else priceStatus = "Fonti PAPER recenti: verifica solo informativa";
  const paperReviewCandidate = input.researchFresh
    && matched.length === 1
    && currencyMatch
    && (instrument?.assetClass === "equity" || instrument?.assetClass === "etf")
    && input.venue?.state === "OPEN"
    && input.venue?.authoritative === true
    && input.venue?.paperQuoteRefreshCandidate === true
    && input.quoteSnapshotCurrent
    && quote?.state === "SOURCE_CANDIDATE_ONLY"
    && observedCurrenciesMatch && validatedSources >= 2
    && quote?.snapshotPaperEligible === true && input.quoteGateReady;
  return {
    exchangeMic: mic,
    marketStatus,
    priceStatus,
    paperReviewCandidate: paperReviewCandidate === true,
    actionAllowed: false as const,
    liveTradingAllowed: false as const,
    brokerPositionVerified: false as const,
  };
}
