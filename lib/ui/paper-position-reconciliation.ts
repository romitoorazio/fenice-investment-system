import { paperTimestamp } from "../trading/paper-timestamp-integrity.ts";

/**
 * PAPER buy-side lot reconciliation, isolated from frozen V6 execution files.
 * Only historical paper entry evidence is checked. NO current quote, FX mark,
 * net NAV, closed-trade profit, benchmark return or broker cash is inferred.
 */
export type PaperLot = {
  clientOrderId?: string;
  symbol?: string;
  side?: string;
  status?: string;
  filledQuantity?: number;
  fillPrice?: number;
  notionalEuro?: number;
  currency?: string;
  fxToEuro?: number;
  fxObservedAt?: string;
  filledAt?: string;
  estimatedFeeEuro?: number;
  estimatedSlippageEuro?: number;
};
export type PaperPosition = {
  symbol?: string;
  quantity?: number;
  averagePrice?: number;
  currency?: string;
  fxToEuro?: number;
};
export type PaperPositionSnapshot = {
  generatedAt?: string;
  mode?: string;
  liveTradingAllowed?: boolean;
  brokerConnectivityAllowed?: boolean;
  executions?: PaperLot[];
  positions?: PaperPosition[];
  reconciliation?: { balanced?: boolean; breaks?: unknown[] };
};
type ReconciledRow = {
  symbol: string;
  currency: string;
  buyLots: number;
  quantity: number;
  storedQuantity: number;
  weightedFillPrice: number;
  storedAveragePrice: number;
  entryNotionalEuro: number;
  estimatedEntryCostsEuro: number;
  lastFilledAt: string;
};
const round = (value: number, places = 2) =>
  Math.round((value + Number.EPSILON) * 10 ** places) / 10 ** places;
const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const nonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const symbolPattern = /^[A-Z0-9][A-Z0-9.:-]{0,24}$/;
const currencyPattern = /^[A-Z]{3}$/;
const validDate = (value: unknown, now: number) => {
  // Date.parse accepts local timestamps and silently normalizes impossible days.
  if (!Number.isSafeInteger(now) || now < 0 || now > 8.64e15) return null;
  const n = paperTimestamp(value);
  return n !== null && n <= now ? n : null;
};
function failed(reason: string) {
  return {
    status: "INSUFFICIENT" as const,
    reason,
    snapshotAt: null as string | null,
    positionCount: null as number | null,
    reconciledPositionCount: null as number | null,
    filledBuyLots: null as number | null,
    closedTradeCount: null as number | null,
    entryNotionalEuro: null as number | null,
    estimatedEntryCostsEuro: null as number | null,
    rows: [] as ReconciledRow[],
    markedValueEuro: null,
    unrealizedProfitEuro: null,
    realizedProfitEuro: null,
    netProfitEuro: null,
    benchmarkReturnPercent: null,
    liveBrokerVerified: false as const,
  };
}
function divergent(reason: string, at: string) {
  return { ...failed(reason), status: "DIVERGENCE" as const, snapshotAt: at };
}
export function reconcilePaperPositions(snapshot: PaperPositionSnapshot | null | undefined, now: number) {
  const snapshotTime = validDate(snapshot?.generatedAt, now);
  if (!snapshot || !Number.isFinite(now) || snapshotTime === null
    || snapshot.mode !== "PAPER" || snapshot.liveTradingAllowed !== false
    || snapshot.brokerConnectivityAllowed !== false) {
    return failed("Snapshot PAPER non sicuro, futuro o mancante.");
  }
  const at = snapshot.generatedAt!;
  if (!Array.isArray(snapshot.executions) || !Array.isArray(snapshot.positions)
      || snapshot.executions.some(x => !x || typeof x !== "object" || Array.isArray(x))
      || snapshot.positions.some(x => !x || typeof x !== "object" || Array.isArray(x))
      || snapshot.reconciliation?.balanced !== true
      || !Array.isArray(snapshot.reconciliation.breaks)
      || snapshot.reconciliation.breaks.length !== 0) {
    return divergent("Riconciliazione OMS non confermata o strutturalmente incompleta.", at);
  }
  // Close-out accounting requires matching and approved costs. Never infer it
  // from buy-side-only basis when a SELL or short exists in the ledger.
  const fills = snapshot.executions.filter(x => x.status === "PAPER_FILLED");
  if (fills.some(x => x.side !== "BUY"))
    return divergent("Sono presenti vendite o lati non riconosciuti: profitti chiusi non ricostruibili.", at);
  if (!fills.length || !snapshot.positions.length)
    return failed("Nessun fill PAPER e posizione aperta confrontabile.");
  const seen = new Set<string>();
  const groups = new Map<string, PaperLot[]>();
  for (const fill of fills) {
    const id = fill.clientOrderId;
    const symbol = fill.symbol;
    const filled = validDate(fill.filledAt, now);
    const fxTime = validDate(fill.fxObservedAt, now);
    if (!id || typeof id !== "string" || seen.has(id)
        || !symbol || !symbolPattern.test(symbol)
        || !currencyPattern.test(fill.currency ?? "")
        || !positive(fill.filledQuantity) || !positive(fill.fillPrice)
        || !positive(fill.fxToEuro) || !positive(fill.notionalEuro)
        || !nonnegative(fill.estimatedFeeEuro)
        || !nonnegative(fill.estimatedSlippageEuro)
        || filled === null || filled > snapshotTime
        || fxTime === null || fxTime > filled
        || filled - fxTime > 10 * 60_000) {
      return divergent("Fill PAPER duplicato o con prezzo, cambio, tempo o costi invalidi.", at);
    }
    const reconstructedNotional = fill.filledQuantity * fill.fillPrice * fill.fxToEuro;
    if (!Number.isFinite(reconstructedNotional)
        || Math.abs(reconstructedNotional - fill.notionalEuro) > 0.05) {
      return divergent("Controvalore EUR non coerente con quantità, prezzo e cambio al fill.", at);
    }
    seen.add(id);
    groups.set(symbol, [...(groups.get(symbol) ?? []), fill]);
  }
  if (groups.size !== snapshot.positions.length)
    return divergent("Posizioni registrate non corrispondono ai titoli con fill PAPER.", at);

  const storedSymbols = new Set<string>();
  const rows: ReconciledRow[] = [];
  for (const stored of snapshot.positions) {
    const symbol = stored.symbol;
    if (!symbol || storedSymbols.has(symbol)
        || !symbolPattern.test(symbol)
        || !positive(stored.quantity)
        || !positive(stored.averagePrice)
        || !positive(stored.fxToEuro)
        || !currencyPattern.test(stored.currency ?? "")) {
      return divergent("Posizione OMS duplicata o con quantità, valuta o prezzo invalidi.", at);
    }
    storedSymbols.add(symbol);
    const lots = groups.get(symbol);
    if (!lots?.length || lots.some(lot => lot.currency !== stored.currency)) {
      return divergent("Posizione OMS senza fill o con valuta diversa.", at);
    }
    const quantity = lots.reduce((acc, lot) => acc + lot.filledQuantity!, 0);
    const weightedNumerator = lots.reduce((acc, lot) => acc + lot.filledQuantity! * lot.fillPrice!, 0);
    const weightedPrice = weightedNumerator / quantity;
    if (!Number.isFinite(quantity) || !Number.isFinite(weightedNumerator)
      || !Number.isFinite(weightedPrice)
      || Math.abs(quantity - stored.quantity) > 1e-6
      || Math.abs(weightedPrice - stored.averagePrice) > 0.0001) {
      return divergent("Quantità o prezzo medio OMS non corrisponde al registro eseguiti.", at);
    }
    const roundedQuantity = round(quantity, 6);
    const roundedPrice = round(weightedPrice, 4);
    const roundedAveragePrice = round(stored.averagePrice!, 4);
    const entryNotionalEuro = round(lots.reduce((acc, lot) => acc + lot.notionalEuro!, 0));
    const estimatedEntryCostsEuro = round(lots.reduce((acc, lot) =>
      acc + lot.estimatedFeeEuro! + lot.estimatedSlippageEuro!, 0));
    if (![roundedQuantity, roundedPrice, roundedAveragePrice, entryNotionalEuro,
      estimatedEntryCostsEuro].every(Number.isFinite)) {
      return divergent("Aggregati PAPER non rappresentabili: nessun importo certificabile.", at);
    }
    rows.push({
      symbol, currency: stored.currency!, buyLots: lots.length,
      quantity: roundedQuantity,
      storedQuantity: stored.quantity!,
      weightedFillPrice: roundedPrice,
      storedAveragePrice: roundedAveragePrice,
      entryNotionalEuro,
      estimatedEntryCostsEuro,
      lastFilledAt: [...lots].sort((a, b) => a.filledAt!.localeCompare(b.filledAt!)).at(-1)!.filledAt!,
    });
  }
  rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
  const totalNotional = rows.reduce((sum, row) => sum + row.entryNotionalEuro, 0);
  const totalCosts = rows.reduce((sum, row) => sum + row.estimatedEntryCostsEuro, 0);
  const roundedTotalNotional = round(totalNotional);
  const roundedTotalCosts = round(totalCosts);
  if (![roundedTotalNotional, roundedTotalCosts].every(Number.isFinite)) {
    return divergent("Totali PAPER non rappresentabili: riconciliazione non dimostrata.", at);
  }
  return {
    status: "RECONCILED" as const,
    reason: "Lotti BUY PAPER e posizioni OMS coincidono. Senza prezzi e cambio alla stessa data non esiste una valorizzazione netta verificata.",
    snapshotAt: at,
    positionCount: snapshot.positions.length,
    reconciledPositionCount: rows.length,
    filledBuyLots: fills.length,
    closedTradeCount: 0,
    entryNotionalEuro: roundedTotalNotional,
    estimatedEntryCostsEuro: roundedTotalCosts,
    rows,
    // Entry FX in the ledger is historical, NOT a current exchange rate.
    markedValueEuro: null,
    unrealizedProfitEuro: null,
    realizedProfitEuro: null,
    netProfitEuro: null,
    benchmarkReturnPercent: null,
    liveBrokerVerified: false as const,
  };
}
