import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { evaluateExecutionCoverageReport } from "../trading/execution-coverage.ts";
import { evaluateDecisionDataGate } from "../trading/decision-data-gate.mjs";
import { evaluateMarketSession, type MarketSessionEvidence } from "../trading/market-session.ts";
import { verifyAuditChain } from "../trading/audit-chain.ts";
import { evaluateFeniceAIThesis, validateFeniceAIThesis, type FeniceAIThesis } from "../ai-intelligence-core.ts";
import { evaluatePreTradeRisk, DEFAULT_RISK_LIMITS } from "../trading/risk-engine.ts";
import { deduplicateExecutionEvidence, type ExecutionInstrument, type ExecutionMarketEvidence } from "../trading/execution-market-data.ts";
import type { ProposedOrder, RiskContext } from "../trading/types.ts";
import { buildPaperReviewProposal, type PaperReviewPayload } from "./paper-review.ts";
import {
  fetchFreshPaperReviewContext,
  paperReviewCredentialsFromEnvironment,
  type FreshPaperReviewContext,
  type PaperReviewProviderCredentials,
} from "./paper-review-live-context.ts";

type Asset = { symbol: string; name?: string; currency?: string; price?: number; confidence?: number; riskScore?: number; reason?: string };
type Position = { symbol: string; quantity: number; currency: string; fxToEuro: number };
type Queue = { mode: string; orders: (ProposedOrder & { aiThesis?: FeniceAIThesis })[] };
type State = {
  mode: string; liveTradingAllowed?: boolean; brokerConnectivityAllowed?: boolean;
  positions: Position[]; openOrders: unknown[];
  executions: { clientOrderId: string; status: string; filledAt?: string; notionalEuro?: number }[];
  reconciliation?: { balanced?: boolean; breaks?: unknown[] }; killSwitch?: { engaged?: boolean };
  auditChain: Parameters<typeof verifyAuditChain>[0];
};
type Fx = { provider?: string; baseCurrency?: string; generatedAt?: string; provenanceVerified?: boolean; liveTradingAllowed?: boolean; brokerConnectivityAllowed?: boolean; ratesToEuro?: Record<string, { rate: number; observedAt: string }> };
type InstrumentMaster = { instruments?: { ticker?: string; assetClass?: string; exchangeMic?: string; currency?: string; country?: string; status?: string }[] };
export type PaperReviewLoadOptions = {
  refreshLiveContext?: boolean;
  credentials?: PaperReviewProviderCredentials;
  liveContextLoader?: typeof fetchFreshPaperReviewContext;
};

const object = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value);
async function readJson<T>(root: string, name: string): Promise<T | null> {
  try {
    const data: unknown = JSON.parse(await readFile(path.join(root, "data", name), "utf8"));
    return object(data) ? data as T : null;
  } catch { return null; }
}
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const fresh = (timestamp: unknown, now: number, maxAgeMs: number) => typeof timestamp === "string"
  && Number.isFinite(Date.parse(timestamp)) && Date.parse(timestamp) <= now && now - Date.parse(timestamp) <= maxAgeMs;

/** Read-only adapter: it never stages an order or writes certification data. */
export async function loadPaperReviewPayload(
  root = process.cwd(),
  now = Date.now(),
  options: PaperReviewLoadOptions = {},
): Promise<PaperReviewPayload> {
  if (!Number.isFinite(now)) throw new Error("Invalid review clock");
  const [queue, state, terminal, storedEvidence, storedMarket, storedFx, intelligence, sources, instrumentMaster] = await Promise.all([
    readJson<Queue>(root, "paper-order-queue.json"), readJson<State>(root, "paper-oms-state.json"),
    readJson<{ capitalEuro?: number; generatedAt?: string; assets?: Asset[] }>(root, "terminal-intelligence.json"),
    readJson<{ generatedAt?: string; observations?: ExecutionMarketEvidence[] }>(root, "execution-market-evidence.json"),
    readJson<{ configured?: boolean; liveTradingAllowed?: boolean; evidence?: MarketSessionEvidence }>(root, "paper-market-session.json"),
    readJson<Fx>(root, "paper-fx-evidence.json"),
    readJson<{ generatedAt?: string; intelligenceConfidence?: number }>(root, "intelligence-quality.json"),
    readJson<{ generatedAt?: string; critical?: { gate?: string } }>(root, "global-source-health.json"),
    readJson<InstrumentMaster>(root, "instrument-master.json"),
  ]);
  let evidence = storedEvidence;
  let market = storedMarket;
  let fx = storedFx;
  let liveContext: FreshPaperReviewContext | null = null;
  const payload: PaperReviewPayload = {
    generatedAt: new Date(now).toISOString(), mode: "PAPER_REVIEW", liveTradingAllowed: false,
    brokerOrderSubmissionAllowed: false, reviewDataSource: "PERSISTED", proposals: [], notices: [],
  };
  if (queue?.mode !== "PAPER" || !Array.isArray(queue.orders) || state?.mode !== "PAPER"
    || state.liveTradingAllowed !== false || state.brokerConnectivityAllowed !== false) {
    payload.notices.push("Il laboratorio deve essere PAPER con gli acquisti reali e il collegamento operativo al broker bloccati.");
    return payload;
  }
  if (![state.positions, state.executions, state.openOrders, state.auditChain, terminal?.assets, evidence?.observations]
    .every(value => Array.isArray(value) && value.every(object))) {
    payload.notices.push("Le evidenze del laboratorio PAPER sono incomplete. Le conferme restano sospese.");
    return payload;
  }

  const queuedReviewOrders = queue.orders.filter(order => object(order)
    && order.mode === "PAPER" && order.side === "BUY" && order.orderType === "LIMIT" && order.timeInForce === "DAY");
  if (options.refreshLiveContext === true && queuedReviewOrders.length > 0) {
    const masterByTicker = new Map((instrumentMaster?.instruments ?? [])
      .filter(item => item?.status === "active" && typeof item?.ticker === "string")
      .map(item => [String(item.ticker).toUpperCase(), item]));
    const requestedInstruments: ExecutionInstrument[] = [];
    const seen = new Set<string>();
    for (const order of queuedReviewOrders) {
      const symbol = String(order.symbol || "").toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      const master = masterByTicker.get(symbol);
      if (!master || master.currency !== order.currency || !master.exchangeMic || !master.assetClass) {
        payload.notices.push(`Il refresh live non riconosce in modo univoco ${symbol} nel catalogo strumenti.`);
        continue;
      }
      seen.add(symbol);
      requestedInstruments.push({
        symbol,
        currency: master.currency,
        assetClass: master.assetClass,
        exchangeMic: master.exchangeMic,
        country: master.country,
      });
      if (requestedInstruments.length >= 3) break;
    }
    if (requestedInstruments.length > 0) {
      try {
        const loader = options.liveContextLoader ?? fetchFreshPaperReviewContext;
        liveContext = await loader({
          instruments: requestedInstruments,
          credentials: options.credentials ?? paperReviewCredentialsFromEnvironment(),
          now,
        });
        payload.reviewDataSource = liveContext.errors.length === 0 ? "LIVE_READONLY" : "PERSISTED";
        const refreshedSymbols = new Set(liveContext.requestedSymbols);
        evidence = {
          generatedAt: liveContext.generatedAt,
          observations: deduplicateExecutionEvidence([
            ...(storedEvidence?.observations ?? []).filter(item => !refreshedSymbols.has(String(item.symbol || "").toUpperCase())),
            ...liveContext.observations,
          ]),
        };
        market = {
          configured: liveContext.marketSession.configured,
          liveTradingAllowed: false,
          evidence: liveContext.marketSession.evidence,
        };
        if (liveContext.fx) fx = liveContext.fx;
        if (liveContext.errors.length > 0) {
          payload.notices.push(`Refresh dati incompleto: ${liveContext.errors.join(", ")}.`);
        } else {
          payload.notices.push("Prezzi, sessione e cambio aggiornati in sola lettura per la revisione.");
        }
      } catch {
        payload.notices.push("Il refresh dati in sola lettura non è riuscito. Nessuna conferma è stata sbloccata.");
      }
    }
  }

  const assets = new Map(terminal!.assets!.map(asset => [asset.symbol, asset]));
  const globalBlockers: string[] = [];
  const decisionGate = evaluateDecisionDataGate({ sourceHealth: sources, intelligence, now, maxAgeMinutes: 10 });
  if (!decisionGate.ready) globalBlockers.push("Qualità e fonti istituzionali devono superare nuovamente i controlli con evidenze aggiornate.");
  if (!fresh(terminal?.generatedAt, now, 24 * 3_600_000) || !positive(terminal?.capitalEuro)) globalBlockers.push("Il capitale e il rapporto del laboratorio devono essere verificati.");
  if (!fresh(evidence?.generatedAt, now, 30 * 60_000)) globalBlockers.push("Le evidenze dei prezzi devono essere aggiornate.");
  const session = evaluateMarketSession(market?.evidence, {}, now);
  const sessionObserved = Date.parse(market?.evidence?.observedAt ?? "");
  if (!session.allowed || market?.configured !== true || market?.liveTradingAllowed !== false
    || !fresh(market?.evidence?.observedAt, now, 60_000)) {
    globalBlockers.push("La sessione di mercato deve essere aperta e verificata di recente.");
  }
  const positionsValid = state.positions.every(position => {
    const asset = assets.get(position.symbol);
    return asset?.currency === position.currency && typeof position.quantity === "number" && Number.isFinite(position.quantity)
      && position.quantity >= 0 && positive(asset.price) && positive(position.fxToEuro);
  });
  if (!positionsValid || !state.executions.every(item => typeof item.clientOrderId === "string" && item.clientOrderId
    && ["PAPER_FILLED", "RISK_REJECTED"].includes(item.status)
    && (item.status !== "PAPER_FILLED" || (positive(item.notionalEuro) && fresh(item.filledAt, now, Infinity))))) {
    globalBlockers.push("Il portafoglio o lo storico simulato non sono verificati.");
  }
  let auditValid = false;
  try { auditValid = verifyAuditChain(state.auditChain).valid; } catch { /* malformed audit evidence blocks review */ }
  if (!auditValid || state.reconciliation?.balanced !== true || !Array.isArray(state.reconciliation.breaks) || state.reconciliation.breaks.length > 0) {
    globalBlockers.push("Il registro o la riconciliazione PAPER non sono verificati.");
  }
  const grossExposure = positionsValid ? state.positions.reduce((sum, p) => sum + p.quantity * Number(assets.get(p.symbol)?.price) * p.fxToEuro, 0) : NaN;
  const day = new Date(now).toISOString().slice(0, 10);
  const turnover = state.executions.filter(item => item.status === "PAPER_FILLED" && item.filledAt?.startsWith(day))
    .reduce((sum, item) => sum + Number(item.notionalEuro ?? NaN), 0);
  const seenOrders = new Set<string>();
  for (const queued of queue.orders) {
    if (!object(queued) || queued.mode !== "PAPER" || typeof queued.symbol !== "string" || typeof queued.clientOrderId !== "string" || !queued.clientOrderId) {
      payload.notices.push("Una voce della coda senza identità PAPER verificata è stata esclusa."); continue;
    }
    if (seenOrders.has(queued.clientOrderId) || state.executions.some(item => item.clientOrderId === queued.clientOrderId)) continue;
    seenOrders.add(queued.clientOrderId);
    if (queued.side !== "BUY" || queued.orderType !== "LIMIT" || queued.timeInForce !== "DAY") {
      payload.notices.push("I probe automatici della campagna non sono proposte di acquisto con prezzo massimo da confermare qui."); continue;
    }
    const asset = assets.get(queued.symbol);
    const blockers = [...globalBlockers];
    if (asset?.currency !== queued.currency) blockers.push("Identità e valuta dello strumento devono corrispondere al rapporto verificato.");
    const observations = evidence!.observations!.filter(item => item.symbol === queued.symbol && item.currency === queued.currency);
    // Use the canonical provenance registry, not a caller-supplied PAPER label.
    const coverage = evaluateExecutionCoverageReport({ requestedSymbols: [queued.symbol], observations }, now).rows[0];
    if (!coverage?.paperEligible) blockers.push("Servono prezzi freschi e concordi da due fonti indipendenti ammesse per PAPER.");
    const accepted = coverage.sourceFamilies.map(family => observations
      .filter(item => item.sourceFamily?.trim().toLowerCase() === family && item.provenanceVerified === true
        && ["PAPER", "LIVE"].includes(item.eligibility) && fresh(item.observedAt, now, 120_000) && positive(item.price))
      .sort((a, b) => Number(b.eligibility === "LIVE") - Number(a.eligibility === "LIVE") || Date.parse(b.observedAt) - Date.parse(a.observedAt))[0]).filter(Boolean);
    const quoteAt = accepted.length ? Math.min(...accepted.map(item => Date.parse(item.observedAt))) : NaN;
    const referencePrice = coverage.medianPrice ?? Number(queued.referencePrice ?? NaN);
    const rate = queued.currency === "EUR" ? 1 : Number(fx?.ratesToEuro?.[queued.currency]?.rate ?? NaN);
    const fxAt = queued.currency === "EUR" ? quoteAt : Date.parse(fx?.ratesToEuro?.[queued.currency]?.observedAt ?? "");
    if (!positive(rate) || rate > 5 || !Number.isFinite(fxAt) || fxAt > now || now - fxAt > 120_000
      || (queued.currency !== "EUR" && (fx?.provider !== "twelve-data" || fx.baseCurrency !== "EUR"
        || fx.provenanceVerified !== true || fx.liveTradingAllowed !== false || fx.brokerConnectivityAllowed !== false
        || !fresh(fx.generatedAt, now, 120_000)))) blockers.push("La conversione in euro deve essere verificata e aggiornata.");
    const requestedAt = Date.parse(queued.requestedAt);
    const expiry = Math.min(Number.isFinite(requestedAt) ? requestedAt + 120_000 : now,
      Number.isFinite(quoteAt) ? quoteAt + 120_000 : now, Number.isFinite(sessionObserved) ? sessionObserved + 60_000 : now,
      Number.isFinite(fxAt) ? fxAt + 120_000 : now);
    const context: RiskContext = {
      capitalEuro: Number(terminal?.capitalEuro ?? NaN), fxToEuro: rate,
      existingPositionNotionalEuro: state.positions.filter(p => p.symbol === queued.symbol).reduce((sum, p) => sum + p.quantity * referencePrice * rate, 0),
      currentGrossExposureEuro: grossExposure, dailyTurnoverEuro: turnover, openOrders: state.openOrders.length,
      dataConfidence: Math.min(Number(intelligence?.intelligenceConfidence ?? NaN), Number(asset?.confidence ?? NaN)),
      independentSources: coverage.independentSourceFamilies, riskScore: Number(asset?.riskScore ?? NaN),
      quoteObservedAt: Number.isFinite(quoteAt) ? new Date(quoteAt).toISOString() : "",
      dataDivergent: !coverage.paperEligible, sourceStale: !decisionGate.ready || !fresh(terminal?.generatedAt, now, 24 * 3_600_000),
      killSwitchEngaged: state.killSwitch?.engaged !== false, brokerConnectivityAllowed: false, liveTradingReleased: false,
    };
    const order: ProposedOrder = { clientOrderId: queued.clientOrderId, symbol: queued.symbol, side: queued.side,
      orderType: queued.orderType, timeInForce: queued.timeInForce, quantity: queued.quantity, currency: queued.currency,
      limitPrice: queued.limitPrice, requestedAt: queued.requestedAt, mode: "PAPER", humanConfirmed: false, referencePrice,
      fxProvider: queued.currency === "EUR" ? "identity" : fx?.provider,
      fxObservedAt: Number.isFinite(fxAt) ? new Date(fxAt).toISOString() : "" };
    const proof = { quotes: accepted.map(item => ({ sourceFamily: item.sourceFamily, observedAt: item.observedAt, price: item.price })),
      sessionObservedAt: market?.evidence?.observedAt ?? "", fxObservedAt: order.fxObservedAt! };
    const name = asset?.name ?? queued.symbol;
    const reason = asset?.reason ?? "Proposta proveniente dalla coda di simulazione PAPER.";
    const preTrade = evaluatePreTradeRisk({ ...order, referencePrice: order.limitPrice ?? order.referencePrice }, context, DEFAULT_RISK_LIMITS, now);
    // Optional AI metadata is actually checked; absent metadata is never
    // manufactured or advertised as a model-generated investment thesis.
    const hasAiInput = Object.hasOwn(queued, "aiThesis");
    const aiInputValid = hasAiInput && validateFeniceAIThesis(queued.aiThesis!, now).length === 0;
    if (hasAiInput && !aiInputValid) blockers.push("La tesi IA contiene dati mancanti, non validi o scaduti.");
    const aiDecision = aiInputValid ? evaluateFeniceAIThesis(queued.aiThesis!, {
      dataQuality: decisionGate.ready ? "PASS" : "BLOCK",
      riskEngine: preTrade.checks.every(check => check.code === "human-confirmation" || check.passed) ? "PASS" : "BLOCK",
      session: session.allowed ? "PASS" : "BLOCK", executionMarketData: coverage.paperEligible ? "PASS" : "BLOCK",
      duplicateOrderGuard: "PASS", killSwitch: context.killSwitchEngaged ? "BLOCK" : "PASS",
      brokerWritesEnabled: false, liveTradingReleased: false,
    }, now) : undefined;
    const terms = { order, context, expiresAt: new Date(expiry).toISOString(), name, reason, evidence: proof, ...(aiDecision ? { aiDecision } : {}) };
    const proposalId = createHash("sha256").update(JSON.stringify(["PAPER_QUEUE", queued.clientOrderId])).digest("hex");
    payload.proposals.push(buildPaperReviewProposal({ ...terms, id: proposalId, scope: "PAPER_QUEUE", blockers }, now));
    if (payload.proposals.length >= 20) break;
  }
  if (payload.proposals.length === 0) payload.notices.unshift("Nessuna proposta PAPER completa in attesa. Fenice non richiede un Sì quando manca una proposta verificabile.");
  payload.notices = [...new Set([...payload.notices, ...globalBlockers])];
  return payload;
}
