import { verifyAuditChain, type AuditEvent } from "../trading/audit-chain.ts";
import { paperTimestamp } from "../trading/paper-timestamp-integrity.ts";
import { reconcilePaperPositions, type PaperPositionSnapshot, type PaperLot } from "./paper-position-reconciliation.ts";

type Quote = { symbol?: string; currency?: string; sourceFamily?: string; eligibility?: string;
  price?: number; observedAt?: string; provenanceVerified?: boolean; provenanceMethod?: string };
export type PaperValuationInputs = {
  paper?: Omit<PaperPositionSnapshot, "executions"> & { auditChain?: AuditEvent[];
    executions?: Array<PaperLot & { fxProvider?: string }> };
  quotes?: { generatedAt?: string; observations?: Quote[]; policy?: { liveTradingAllowed?: boolean } };
  fx?: { generatedAt?: string; provider?: string; baseCurrency?: string; provenanceVerified?: boolean;
    liveTradingAllowed?: boolean; brokerConnectivityAllowed?: boolean;
    ratesToEuro?: Record<string, { rate?: number; observedAt?: string }> };
  session?: { generatedAt?: string; configured?: boolean; liveTradingAllowed?: boolean;
    evidence?: { state?: string; venue?: string; observedAt?: string; authoritative?: boolean } };
};
type ValueRow = { symbol: string; currency: string; recordedQuantity: number; medianPrice: number;
  fxToEuro: number; estimatedValueEuro: number; recordedEntryEuro: number; priceFxChangeEuro: number;
  quoteSources: string[]; quoteObservedAt: string[]; fxObservedAt: string };
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const quoteMethods: Record<string, Set<string>> = {
  alpaca: new Set(["authenticated-alpaca-iex-latest-quote", "authenticated-alpaca-iex-latest-quote-readonly-review"]),
  "twelve-data": new Set(["provider-response-us-realtime-venue", "provider-response-us-realtime-venue-readonly-review",
    "provider-batch-quote-last_quote_at-us-realtime-venue"]),
};
function insufficient(reason: string) {
  return { state: "INSUFFICIENT" as const, reason, asOf: null as string | null,
    ageSeconds: null as number | null, sampleCurrentWithin120Seconds: false,
    estimatedRecordedQuantityValueEuro: null as number | null, recordedEntryEuro: null as number | null,
    priceFxChangeEuro: null as number | null, estimatedEntryFeesEuro: null as number | null,
    changeAfterEstimatedEntryFeesEuro: null as number | null, rows: [] as ValueRow[],
    portfolioNavEuro: null, netRealizedProfitEuro: null, benchmarkExcessReturnPercent: null,
    profitabilityProven: false, executionAuthorized: false, liveTradingAllowed: false };
}

/** Replay a coeval recorded PAPER sample. Never an execution/readiness gate. */
export function valuePaperRecordedQuantities(input: PaperValuationInputs, now = Date.now()) {
  try {
    if (!Number.isSafeInteger(now) || now < 0 || now > 8.64e15) return insufficient("Orologio di verifica invalido.");
    const { paper, quotes, fx, session } = input;
    const positions = reconcilePaperPositions(paper, now);
    if (positions.status !== "RECONCILED") return insufficient("Posizioni e fill PAPER non riconciliati.");
    if (!Array.isArray(paper?.auditChain) || !paper.auditChain.length || !verifyAuditChain(paper.auditChain).valid)
      return insufficient("Catena di audit PAPER non verificata.");
    const filled = paper.executions!.filter(fill => fill.status === "PAPER_FILLED");
    let entryFeesAudited = true;
    for (const fill of filled) {
      if (paperTimestamp(fill.filledAt) === null || paperTimestamp(fill.fxObservedAt) === null)
        return insufficient("Le date originali dei fill o del cambio d'ingresso non sono valide.");
      if ((fill.currency === "USD" && fill.fxProvider !== "twelve-data")
        || (fill.currency === "EUR" && fill.fxProvider !== "identity"))
        return insufficient("Fonte del cambio d'ingresso non verificata.");
      const events = paper.auditChain.filter(event => event.eventType === "PAPER_FILLED" && event.entityId === fill.clientOrderId);
      const event = events[0];
      if (events.length !== 1 || event.timestamp !== fill.filledAt || event.payload.riskAllowed !== true
        || event.payload.symbol !== fill.symbol || event.payload.side !== fill.side
        || event.payload.filledQuantity !== fill.filledQuantity || event.payload.fillPrice !== fill.fillPrice
        || event.payload.currency !== fill.currency || event.payload.fxToEuro !== fill.fxToEuro
        || event.payload.fxProvider !== fill.fxProvider
        || event.payload.fxObservedAt !== fill.fxObservedAt)
        return insufficient("I fill non corrispondono alle prove di audit.");
      // Older frozen V6 events omit estimated fees. Do not present them as verified.
      if (event.payload.estimatedFeeEuro === undefined) entryFeesAudited = false;
      else if (event.payload.estimatedFeeEuro !== fill.estimatedFeeEuro)
        return insufficient("Commissioni d'ingresso non corrispondenti alla catena di audit.");
    }
    const times = [paper.generatedAt, quotes?.generatedAt, fx?.generatedAt, session?.generatedAt,
      session?.evidence?.observedAt].map(paperTimestamp);
    if (times.some(at => at === null || at > now)) return insufficient("Date dei campioni mancanti, invalide o future.");
    const asOfMs = Math.max(...times.slice(1) as number[]);
    if (filled.some(fill => paperTimestamp(fill.filledAt)! > asOfMs))
      return insufficient("Il campione prezzi precede un fill delle quantità registrate.");
    const coeval = (value: unknown, maxAgeMs = 120_000) => {
      const at = paperTimestamp(value);
      return at !== null && at <= asOfMs && asOfMs - at <= maxAgeMs;
    };
    const observedBeforeSnapshot = (observed: unknown, snapshot: unknown) => {
      const observationTime = paperTimestamp(observed);
      const captureTime = paperTimestamp(snapshot);
      return observationTime !== null && captureTime !== null && observationTime <= captureTime;
    };
    if (!coeval(quotes?.generatedAt)) return insufficient("Il campione prezzi non è coevo alla valorizzazione.");
    if (quotes?.policy?.liveTradingAllowed !== false || !Array.isArray(quotes.observations))
      return insufficient("Provenienza o blocco LIVE del campione prezzi non verificati.");
    if (fx?.provider !== "twelve-data" || fx.baseCurrency !== "EUR" || fx.provenanceVerified !== true
      || fx.liveTradingAllowed !== false || fx.brokerConnectivityAllowed !== false || !coeval(fx.generatedAt))
      return insufficient("Il cambio in euro non è verificato alla stessa data dei prezzi.");
    if (session?.configured !== true || session.liveTradingAllowed !== false || session.evidence?.state !== "OPEN"
      || session.evidence.venue !== "US_EQUITIES" || session.evidence.authoritative !== true
      || !coeval(session.generatedAt) || !coeval(session.evidence.observedAt, 60_000)
      || !observedBeforeSnapshot(session.evidence.observedAt, session.generatedAt))
      return insufficient("Sessione USA aperta e coeva non verificata per questo campione.");
    const rows: ValueRow[] = [];
    for (const holding of positions.rows) {
      const familyQuotes = new Map<string, Quote>();
      for (const quote of quotes.observations.filter(q => q?.symbol === holding.symbol && q.eligibility === "PAPER")) {
        const family = quote.sourceFamily || "";
        if (!quoteMethods[family]?.has(quote.provenanceMethod || "") || quote.provenanceVerified !== true) continue;
        if (quote.currency !== holding.currency || !positive(quote.price) || !coeval(quote.observedAt)
          || !observedBeforeSnapshot(quote.observedAt, quotes.generatedAt))
          return insufficient(`Prezzo, valuta o data non validi per ${holding.symbol}.`);
        const previous = familyQuotes.get(family);
        if (previous && previous.observedAt === quote.observedAt && previous.price !== quote.price)
          return insufficient(`Prove discordanti della stessa fonte per ${holding.symbol}.`);
        if (!previous || paperTimestamp(quote.observedAt)! > paperTimestamp(previous.observedAt)!) familyQuotes.set(family, quote);
      }
      const accepted = [...familyQuotes.values()];
      if (accepted.length < 2) return insufficient(`Mancano due prezzi indipendenti verificati per ${holding.symbol}.`);
      const prices = accepted.map(q => q.price!).sort((a, b) => a - b);
      const median = (prices[0] + prices[1]) / 2;
      if ((prices.at(-1)! - prices[0]) / median * 100 > 0.75)
        return insufficient(`Le fonti divergono sul prezzo di ${holding.symbol}.`);
      const rate = fx.ratesToEuro?.[holding.currency];
      if (!rate || !positive(rate.rate) || rate.rate > 5 || !coeval(rate.observedAt)
        || !observedBeforeSnapshot(rate.observedAt, fx.generatedAt)
        || (holding.currency === "EUR" && rate.rate !== 1) || !["EUR", "USD"].includes(holding.currency))
        return insufficient(`Cambio ${holding.currency}/EUR coevo non verificato.`);
      const value = holding.storedQuantity * median * rate.rate;
      rows.push({ symbol: holding.symbol, currency: holding.currency, recordedQuantity: holding.storedQuantity,
        medianPrice: median, fxToEuro: rate.rate, estimatedValueEuro: round(value),
        recordedEntryEuro: holding.entryNotionalEuro, priceFxChangeEuro: round(value - holding.entryNotionalEuro),
        quoteSources: [...familyQuotes.keys()].sort(), quoteObservedAt: accepted.map(q => q.observedAt!), fxObservedAt: rate.observedAt! });
    }
    const value = round(rows.reduce((sum, row) => sum + row.estimatedValueEuro, 0));
    const entry = positions.entryNotionalEuro!;
    const fees = entryFeesAudited ? round(filled.reduce((sum, fill) => sum + fill.estimatedFeeEuro!, 0)) : null;
    // Fill price already includes simulated slippage. Do not deduct it twice.
    const delta = round(value - entry);
    return { ...insufficient(""), state: "VALUED_SAMPLE" as const,
      reason: entryFeesAudited
        ? "Campione storico delle quantità PAPER registrate; prezzi mediani e cambio coevi. Costi d'uscita, imposte, dividendi e azioni societarie non riconciliati."
        : "Campione storico delle quantità PAPER registrate; prezzi mediani e cambio coevi. Commissioni d'ingresso N/D: assenti dalla catena di audit congelata V6. Costi d'uscita, imposte, dividendi e azioni societarie non riconciliati.",
      asOf: new Date(asOfMs).toISOString(), ageSeconds: Math.round((now - asOfMs) / 1000),
      sampleCurrentWithin120Seconds: now - asOfMs <= 120_000,
      estimatedRecordedQuantityValueEuro: value, recordedEntryEuro: entry, priceFxChangeEuro: delta,
      estimatedEntryFeesEuro: fees, changeAfterEstimatedEntryFeesEuro: fees === null ? null : round(delta - fees), rows };
  } catch { return insufficient("Struttura delle prove di valorizzazione non valida."); }
}
