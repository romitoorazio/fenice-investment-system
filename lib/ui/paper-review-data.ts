import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { evaluateMarketDataQuorum, type MarketDataEvidence } from "../trading/market-data-quorum.ts";
import { evaluateMarketSession, type MarketSessionEvidence } from "../trading/market-session.ts";
import { verifyAuditChain } from "../trading/audit-chain.ts";
import type { ProposedOrder, RiskContext } from "../trading/types.ts";
import { buildPaperReviewProposal, type PaperReviewPayload } from "./paper-review.ts";

type Asset = { symbol: string; name?: string; currency?: string; price?: number; confidence?: number; riskScore?: number; reason?: string };
type Position = { symbol: string; quantity: number; currency: string; fxToEuro: number };
type Evidence = MarketDataEvidence & { symbol: string; currency: string; provenanceVerified?: boolean };
type Queue = { mode: string; orders: ProposedOrder[] };
type State = {
  mode: string; positions: Position[]; openOrders: unknown[];
  executions: { clientOrderId: string; status: string; filledAt?: string; notionalEuro?: number }[];
  reconciliation?: { balanced?: boolean }; killSwitch?: { engaged?: boolean };
  auditChain: Parameters<typeof verifyAuditChain>[0];
};
type Fx = { provider?: string; provenanceVerified?: boolean; liveTradingAllowed?: boolean; brokerConnectivityAllowed?: boolean; ratesToEuro?: Record<string, { rate: number; observedAt: string }> };

async function readJson<T>(root: string, name: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path.join(root, "data", name), "utf8")) as T; }
  catch { return null; }
}

export async function loadPaperReviewPayload(root = process.cwd(), now = Date.now()): Promise<PaperReviewPayload> {
  const [queue, state, terminal, evidence, market, fx, intelligence, sources] = await Promise.all([
    readJson<Queue>(root, "paper-order-queue.json"), readJson<State>(root, "paper-oms-state.json"),
    readJson<{ capitalEuro?: number; generatedAt?: string; assets?: Asset[] }>(root, "terminal-intelligence.json"),
    readJson<{ observations?: Evidence[] }>(root, "execution-market-evidence.json"),
    readJson<{ evidence?: MarketSessionEvidence }>(root, "paper-market-session.json"), readJson<Fx>(root, "paper-fx-evidence.json"),
    readJson<{ generatedAt?: string; intelligenceConfidence?: number }>(root, "intelligence-quality.json"),
    readJson<{ generatedAt?: string; critical?: { gate?: string } }>(root, "global-source-health.json"),
  ]);
  const payload: PaperReviewPayload = {
    generatedAt: new Date(now).toISOString(), mode: "PAPER_REVIEW", liveTradingAllowed: false,
    brokerOrderSubmissionAllowed: false, proposals: [], notices: [],
  };
  if (queue?.mode !== "PAPER" || !Array.isArray(queue.orders) || state?.mode !== "PAPER") {
    payload.notices.push("Le proposte di simulazione non sono disponibili.");
    return payload;
  }
  if (!Array.isArray(state.positions) || !Array.isArray(state.executions) || !Array.isArray(state.openOrders)
    || !Array.isArray(state.auditChain) || !Array.isArray(terminal?.assets) || !Array.isArray(evidence?.observations)) {
    payload.notices.push("Le evidenze del laboratorio PAPER sono incomplete. Le conferme restano sospese.");
    return payload;
  }
  if (queue.orders.length === 0) {
    payload.notices.push("Nessuna proposta PAPER in attesa. Fenice non chiede conferme quando manca una proposta completa.");
    return payload;
  }
  const session = evaluateMarketSession(market?.evidence, {}, now);
  const sessionObserved = Date.parse(market?.evidence?.observedAt ?? "");
  const assets = new Map((terminal?.assets ?? []).map((asset) => [asset.symbol, asset]));
  const globalBlockers: string[] = [];
  const positionsValid = Array.isArray(state.positions) && state.positions.every((position) => {
    const asset = assets.get(position.symbol);
    return asset?.currency === position.currency && [position.quantity, asset.price, position.fxToEuro].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)
      && Number(asset.price) > 0 && position.fxToEuro > 0;
  });
  if (!positionsValid || !Array.isArray(state.executions) || !Array.isArray(state.openOrders)) globalBlockers.push("Il portafoglio simulato non è verificato.");
  if (!session.allowed || !Number.isFinite(sessionObserved) || sessionObserved > now) globalBlockers.push("La sessione di mercato deve essere aperta e verificata di recente.");
  if (!Array.isArray(state.auditChain) || !verifyAuditChain(state.auditChain).valid || state.reconciliation?.balanced !== true) globalBlockers.push("Il registro o la riconciliazione PAPER non sono verificati.");
  const grossExposure = positionsValid ? state.positions.reduce((sum, p) => sum + p.quantity * Number(assets.get(p.symbol)?.price) * p.fxToEuro, 0) : 0;
  const day = new Date(now).toISOString().slice(0, 10);
  const turnover = (state.executions ?? []).filter((item) => item.status === "PAPER_FILLED" && item.filledAt?.startsWith(day))
    .reduce((sum, item) => sum + Number(item.notionalEuro ?? NaN), 0);
  const stale = (timestamp?: string) => !Number.isFinite(Date.parse(timestamp ?? "")) || now < Date.parse(timestamp ?? "") || now - Date.parse(timestamp ?? "") > 6 * 3_600_000;
  for (const queued of queue.orders.slice(0, 20)) {
    if (!queued || typeof queued !== "object") continue;
    const asset = assets.get(queued.symbol);
    const blockers = [...globalBlockers];
    if (queued.mode !== "PAPER") { payload.notices.push("Una proposta non PAPER è stata esclusa."); continue; }
    if (state.executions?.some((item) => item.clientOrderId === queued.clientOrderId)) continue;
    const observations = (evidence?.observations ?? []).filter((item) => item.symbol === queued.symbol && item.currency === queued.currency && item.provenanceVerified === true);
    const quorum = evaluateMarketDataQuorum(observations, undefined, now);
    if (!quorum.allowNewRisk) blockers.push("Servono prezzi freschi e concordi da due fonti indipendenti ammesse per PAPER.");
    const referencePrice = quorum.medianPrice ?? Number(queued.referencePrice ?? NaN);
    const quoteObserved = observations.filter((item) => quorum.sourceFamilies.includes(item.sourceFamily ?? ""))
      .map((item) => Date.parse(item.observedAt)).filter(Number.isFinite);
    const quoteAt = quoteObserved.length ? Math.min(...quoteObserved) : NaN;
    const rate = queued.currency === "EUR" ? 1 : Number(fx?.ratesToEuro?.[queued.currency]?.rate ?? NaN);
    const fxAt = queued.currency === "EUR" ? quoteAt : Date.parse(fx?.ratesToEuro?.[queued.currency]?.observedAt ?? "");
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(fxAt) || fxAt > now || now - fxAt > 120_000
      || (queued.currency !== "EUR" && (fx?.provenanceVerified !== true || fx.liveTradingAllowed !== false || fx.brokerConnectivityAllowed !== false))) {
      blockers.push("La conversione in euro deve essere verificata e aggiornata.");
    }
    const requestedAt = Number.isFinite(Date.parse(queued.requestedAt)) ? Date.parse(queued.requestedAt) : now - 120_000;
    const expiry = Math.min(requestedAt + 120_000, Number.isFinite(quoteAt) ? quoteAt + 120_000 : now, Number.isFinite(sessionObserved) ? sessionObserved + 60_000 : now, Number.isFinite(fxAt) ? fxAt + 120_000 : now);
    const context: RiskContext = {
      capitalEuro: Number(terminal?.capitalEuro ?? NaN), fxToEuro: rate,
      existingPositionNotionalEuro: (state.positions ?? []).filter((p) => p.symbol === queued.symbol).reduce((sum, p) => sum + p.quantity * referencePrice * rate, 0),
      currentGrossExposureEuro: grossExposure, dailyTurnoverEuro: turnover, openOrders: state.openOrders?.length ?? NaN,
      dataConfidence: Math.min(Number(intelligence?.intelligenceConfidence ?? NaN), Number(asset?.confidence ?? NaN)),
      independentSources: quorum.independentSources, riskScore: Number(asset?.riskScore ?? NaN),
      quoteObservedAt: Number.isFinite(quoteAt) ? new Date(quoteAt).toISOString() : "",
      dataDivergent: !quorum.allowNewRisk, sourceStale: stale(terminal?.generatedAt) || stale(intelligence?.generatedAt) || stale(sources?.generatedAt) || sources?.critical?.gate !== "GREEN",
      killSwitchEngaged: state.killSwitch?.engaged !== false, brokerConnectivityAllowed: false, liveTradingReleased: false,
    };
    const order = { ...queued, humanConfirmed: false, referencePrice, fxProvider: queued.currency === "EUR" ? "identity" : fx?.provider, fxObservedAt: Number.isFinite(fxAt) ? new Date(fxAt).toISOString() : "" };
    const terms = { order, context, expiresAt: new Date(expiry).toISOString(), name: asset?.name ?? queued.symbol, reason: asset?.reason ?? "Proposta proveniente dalla coda di simulazione PAPER." };
    payload.proposals.push(buildPaperReviewProposal({ ...terms, id: createHash("sha256").update(JSON.stringify(terms)).digest("hex"), scope: "PAPER_QUEUE", blockers }, now));
  }
  return payload;
}
