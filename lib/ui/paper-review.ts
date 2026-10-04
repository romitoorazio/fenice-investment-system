import { PaperOms } from "../trading/paper-oms.ts";
import { DEFAULT_RISK_LIMITS, evaluatePreTradeRisk } from "../trading/risk-engine.ts";
import type { PaperExecution, ProposedOrder, RiskContext } from "../trading/types.ts";

export type PaperReviewProposal = {
  id: string;
  scope: "PAPER_QUEUE" | "DEMO";
  name: string;
  reason: string;
  order: ProposedOrder;
  context: RiskContext;
  expiresAt: string;
  blockers: string[];
  maxNotionalEuro: number;
  estimatedFeeEuro: number;
  maxTotalEuro: number;
};

export type PaperReviewPayload = {
  generatedAt: string;
  mode: "PAPER_REVIEW";
  liveTradingAllowed: false;
  brokerOrderSubmissionAllowed: false;
  proposals: PaperReviewProposal[];
  notices: string[];
};

export type PaperReviewRecord = {
  proposalId: string;
  clientOrderId: string;
  scope: PaperReviewProposal["scope"];
  termsKey: string;
  answer: "YES" | "NO";
  decidedAt: string;
  mode: "PAPER_REVIEW";
  transmitted: false;
  execution: PaperExecution | null;
};

const riskCopy: Record<string, string> = {
  "kill-switch": "I controlli di sicurezza sono bloccati.",
  "valid-capital": "Il capitale simulato non è verificato.",
  "valid-order-size": "Quantità o prezzo non validi.",
  "max-order-notional": "L’importo supera il limite per una singola operazione.",
  "max-single-asset": "La concentrazione su questo titolo supera il limite.",
  "max-gross-exposure": "L’esposizione complessiva supera il limite.",
  "max-daily-turnover": "Il limite giornaliero di operazioni è superato.",
  "data-confidence": "La qualità dei dati non supera la soglia richiesta.",
  "independent-sources": "Mancano due fonti indipendenti verificate.",
  "risk-score": "Il rischio del titolo supera il limite.",
  "quote-freshness": "Il prezzo deve essere aggiornato.",
  "no-divergence": "Le fonti non concordano sul prezzo.",
  "source-freshness": "Le evidenze devono essere aggiornate.",
};

export function reviewTermsKey(proposal: PaperReviewProposal): string {
  return JSON.stringify([
    proposal.id, proposal.scope, proposal.name, proposal.reason,
    proposal.order, proposal.context, proposal.expiresAt,
    proposal.blockers, proposal.maxNotionalEuro, proposal.estimatedFeeEuro, proposal.maxTotalEuro,
  ]);
}

export function buildPaperReviewProposal(
  input: Omit<PaperReviewProposal, "maxNotionalEuro" | "estimatedFeeEuro" | "maxTotalEuro">,
  now = Date.now(),
): PaperReviewProposal {
  const order = { ...input.order, humanConfirmed: false };
  const blockers = [...input.blockers];
  if (order.mode !== "PAPER" || input.context.liveTradingReleased !== false || input.context.brokerConnectivityAllowed !== false) {
    blockers.push("La proposta deve restare in simulazione, senza collegamento operativo al broker.");
  }
  if (order.side !== "BUY" || order.orderType !== "LIMIT" || order.timeInForce !== "DAY") {
    blockers.push("Serve una proposta di acquisto con prezzo massimo e durata giornaliera.");
  }
  if (!order.clientOrderId || !order.symbol || !/^[A-Z]{3}$/.test(order.currency)) {
    blockers.push("Identità della proposta o valuta mancanti.");
  }
  if (![order.quantity, order.referencePrice, order.limitPrice].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)) {
    blockers.push("Quantità, prezzo osservato e prezzo massimo devono essere verificati.");
  }
  const contextValid = [
    input.context.capitalEuro, input.context.fxToEuro, input.context.existingPositionNotionalEuro,
    input.context.currentGrossExposureEuro, input.context.dailyTurnoverEuro,
    input.context.openOrders, input.context.dataConfidence, input.context.independentSources, input.context.riskScore,
  ].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
  if (!contextValid) blockers.push("Il contesto di rischio è incompleto.");
  if (contextValid) {
    const risk = evaluatePreTradeRisk(
      { ...order, referencePrice: order.limitPrice ?? order.referencePrice }, input.context, DEFAULT_RISK_LIMITS, now,
    );
    for (const check of risk.checks) {
      if (!check.passed && check.code !== "human-confirmation") blockers.push(riskCopy[check.code] ?? "Un controllo di sicurezza non è superato.");
    }
  }
  const requested = Date.parse(order.requestedAt);
  const observed = Date.parse(input.context.quoteObservedAt);
  const expiry = Date.parse(input.expiresAt);
  if (![now, requested, observed, expiry].every(Number.isFinite) || requested > now || observed > now || expiry <= now
    || expiry > requested + 120_000 || expiry > observed + 120_000) {
    blockers.push("La proposta è scaduta o i suoi orari non sono verificati.");
  }
  const notional = order.quantity * Number(order.limitPrice) * input.context.fxToEuro;
  const maxNotionalEuro = Number.isFinite(notional) && notional > 0 ? Number(notional.toFixed(2)) : 0;
  const estimatedFeeEuro = maxNotionalEuro > 0 ? Number(Math.max(1.5, maxNotionalEuro * 8 / 10_000).toFixed(2)) : 0;
  const maxTotalEuro = Number((maxNotionalEuro + estimatedFeeEuro).toFixed(2));
  if (maxTotalEuro > input.context.capitalEuro - input.context.currentGrossExposureEuro) {
    blockers.push("L’importo con i costi supera la liquidità simulata disponibile.");
  }
  return { ...input, order, blockers: [...new Set(blockers)], maxNotionalEuro, estimatedFeeEuro, maxTotalEuro };
}

export function createPaperReviewDemo(now = Date.now()): PaperReviewProposal {
  const observedAt = new Date(now).toISOString();
  return buildPaperReviewProposal({
    id: `demo-${now}`,
    scope: "DEMO",
    name: "Strumento dimostrativo",
    reason: "Esempio inventato per provare Sì e No. Non è un titolo acquistabile né una raccomandazione.",
    expiresAt: new Date(now + 120_000).toISOString(),
    blockers: [],
    order: {
      clientOrderId: `demo-${now}`, symbol: "DEMO", side: "BUY", orderType: "LIMIT", timeInForce: "DAY",
      quantity: 1, referencePrice: 49.9, limitPrice: 50, currency: "EUR", mode: "PAPER",
      requestedAt: observedAt, humanConfirmed: false,
    },
    context: {
      capitalEuro: 1000, fxToEuro: 1, existingPositionNotionalEuro: 0, currentGrossExposureEuro: 0,
      dailyTurnoverEuro: 0, openOrders: 0, dataConfidence: 100, independentSources: 2, riskScore: 20,
      quoteObservedAt: observedAt, dataDivergent: false, sourceStale: false, killSwitchEngaged: false,
      brokerConnectivityAllowed: false, liveTradingReleased: false,
    },
  }, now);
}

export function decidePaperReview(
  proposal: PaperReviewProposal, answer: "YES" | "NO", records: readonly PaperReviewRecord[], now = Date.now(),
): PaperReviewRecord {
  if (answer !== "YES" && answer !== "NO") throw new Error("Risposta non valida: scegli Sì o No.");
  if (proposal.order.mode !== "PAPER" || proposal.context.liveTradingReleased !== false || proposal.context.brokerConnectivityAllowed !== false) {
    throw new Error("Gli ordini reali restano bloccati.");
  }
  const termsKey = reviewTermsKey(proposal);
  const existing = records.find((record) => record.proposalId === proposal.id);
  if (existing) {
    if (existing.termsKey !== termsKey) throw new Error("La proposta è cambiata: serve una nuova revisione.");
    return existing;
  }
  if (records.some((record) => record.scope === proposal.scope && record.clientOrderId === proposal.order.clientOrderId)) {
    throw new Error("Questa proposta è già stata valutata su questo dispositivo.");
  }
  if (!Number.isFinite(now)) throw new Error("Orario di conferma non valido.");
  let execution: PaperExecution | null = null;
  if (answer === "YES") {
    const checked = buildPaperReviewProposal(proposal, now);
    if (reviewTermsKey(checked) !== termsKey || checked.blockers.length > 0) {
      throw new Error("La proposta non è più valida. Aggiorna prima di confermare.");
    }
    execution = new PaperOms().submit({ ...proposal.order, humanConfirmed: true }, proposal.context, now);
    if (execution.status !== "PAPER_FILLED") throw new Error("Simulazione bloccata: il prezzo o i controlli non consentono l’operazione.");
  }
  return {
    proposalId: proposal.id, clientOrderId: proposal.order.clientOrderId, scope: proposal.scope, termsKey, answer,
    decidedAt: new Date(now).toISOString(), mode: "PAPER_REVIEW", transmitted: false, execution,
  };
}

export function parsePaperReviewHistory(raw: string | null): PaperReviewRecord[] {
  if (raw === null) return [];
  const value = JSON.parse(raw) as { version?: number; mode?: string; records?: PaperReviewRecord[] };
  if (value.version !== 1 || value.mode !== "PAPER_REVIEW" || !Array.isArray(value.records) || value.records.length > 100) {
    throw new Error("Il registro delle decisioni non è leggibile.");
  }
  const ids = new Set<string>();
  for (const record of value.records) {
    if (!record || record.mode !== "PAPER_REVIEW" || record.transmitted !== false || !record.proposalId || !record.clientOrderId
      || !record.termsKey || !["PAPER_QUEUE", "DEMO"].includes(record.scope) || !["YES", "NO"].includes(record.answer)
      || !Number.isFinite(Date.parse(record.decidedAt)) || ids.has(record.proposalId)
      || (record.answer === "NO" && record.execution !== null)
      || (record.answer === "YES" && (record.execution?.status !== "PAPER_FILLED" || record.execution.clientOrderId !== record.clientOrderId))) {
      throw new Error("Il registro delle decisioni contiene dati non validi.");
    }
    ids.add(record.proposalId);
  }
  return value.records;
}
