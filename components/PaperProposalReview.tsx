"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createPaperReviewDemo, decidePaperReview, parsePaperReviewHistory,
  type PaperReviewPayload, type PaperReviewProposal,
} from "@/lib/ui/paper-review";

const storageKey = "fenice-paper-proposal-review-v1";
const changeEvent = "fenice-paper-review-change";
const loadingHistory = "__LOADING__";
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const number = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6 });

const diagnosticBlockerCopy: Record<string, string> = {
  COMMITTEE_NOT_BUY: "Il Comitato non è ancora su COMPRA.",
  TERMINAL_NOT_ACCUMULA: "Il Terminale non è ancora su ACCUMULA.",
  COMMITTEE_SCORE_BELOW_REVIEW_MINIMUM: "Il punteggio del Comitato è sotto la soglia richiesta.",
  CALIBRATED_CONFIDENCE_BELOW_REVIEW_MINIMUM: "La confidenza calibrata non ha ancora raggiunto 90/100.",
  RISK_SCORE_ABOVE_REVIEW_MAXIMUM: "Il rischio supera il massimo ammesso.",
  CURRENCY_NOT_SUPPORTED_BY_CURRENT_PAPER_FX: "La valuta non è coperta dal cambio PAPER verificato.",
  PAPER_EXECUTION_COVERAGE_NOT_ELIGIBLE: "Manca la copertura prezzi PAPER richiesta.",
  PAPER_SOURCE_QUORUM_NOT_MET: "Mancano due fonti PAPER indipendenti.",
  ENTRY_PLAN_NOT_LIMIT: "Non esiste ancora un piano di ingresso LIMIT.",
  ENTRY_LIMIT_PRICE_MISSING: "Manca il prezzo massimo di ingresso.",
  ENTRY_TRANCHE_MISSING: "Manca la prima tranche verificata.",
  COMMITTEE_EXECUTION_GATE_NOT_READY: "Il gate finale del Comitato non è ancora pronto.",
};

function euroOrUnknown(value: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? euro.format(value) : "Non disponibile";
}

function subscribeHistory(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changeEvent, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(changeEvent, callback); };
}

function readHistory() {
  try { return window.localStorage.getItem(storageKey); }
  catch { return "__STORAGE_UNAVAILABLE__"; }
}

async function fetchProposals(signal?: AbortSignal): Promise<PaperReviewPayload> {
  const response = await fetch("/api/trading/proposals", { cache: "no-store", signal });
  if (!response.ok) throw new Error("Le proposte non si possono aggiornare. Riprova tra poco.");
  const data = await response.json() as PaperReviewPayload;
  if (data.mode !== "PAPER_REVIEW" || data.liveTradingAllowed !== false || data.brokerOrderSubmissionAllowed !== false || !Array.isArray(data.proposals)) {
    throw new Error("La modalità simulazione non è verificata.");
  }
  return data;
}

export default function PaperProposalReview({ initialData }: { initialData: PaperReviewPayload }) {
  const [data, setData] = useState(initialData);
  const [demo, setDemo] = useState<PaperReviewProposal | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.parse(initialData.generatedAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionPending = useRef(false);
  const rawHistory = useSyncExternalStore(subscribeHistory, readHistory, () => loadingHistory);
  const history = useMemo(() => {
    if (rawHistory === loadingHistory) return null;
    try { return parsePaperReviewHistory(rawHistory); } catch { return null; }
  }, [rawHistory]);

  useEffect(() => {
    let active = true;
    let refreshing = false;
    const controller = new AbortController();
    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        const next = await fetchProposals(AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
        if (active) { setData(next); setError(null); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Aggiornamento non riuscito.");
      } finally { refreshing = false; }
    }
    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(), 30_000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; controller.abort(); window.clearInterval(refreshTimer); window.clearInterval(clockTimer); };
  }, []);

  const proposals = demo ? [demo] : data.proposals;
  const proposal = proposals.find((item) => item.id === selectedId) ?? proposals[0] ?? null;
  const decision = history?.find((record) => record.proposalId === proposal?.id);
  const remaining = proposal ? Math.max(0, Math.ceil((Date.parse(proposal.expiresAt) - now) / 1000)) : 0;
  const liveReviewConfirmed = Boolean(proposal && (proposal.scope === "DEMO" || data.reviewDataSource === "LIVE_READONLY"));
  const eligible = Boolean(proposal && proposal.blockers.length === 0 && remaining > 0 && !decision && history && liveReviewConfirmed);

  async function answer(choice: "YES" | "NO") {
    if (!proposal || actionPending.current || history === null || decision) return;
    actionPending.current = true;
    setBusy(true);
    setError(null);
    try {
      const current = proposal;
      if (choice === "YES" && proposal.scope === "PAPER_QUEUE" && data.reviewDataSource !== "LIVE_READONLY") {
        throw new Error("La verifica PAPER dal browser è sospesa: quote e costi API sono protetti. Nessun Sì è stato registrato.");
      }
      const saveDecision = () => {
        const latest = parsePaperReviewHistory(window.localStorage.getItem(storageKey));
        const record = decidePaperReview(current, choice, latest, Date.now());
        const records = latest.some((item) => item.proposalId === record.proposalId) ? latest : [...latest, record];
        window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, mode: "PAPER_REVIEW", records }));
        window.dispatchEvent(new Event(changeEvent));
      };
      if (!navigator.locks) throw new Error("Per salvare le decisioni in sicurezza usa una versione aggiornata di Chrome o Edge.");
      await navigator.locks.request(storageKey, saveDecision);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La decisione non è stata salvata. Nessuna operazione effettuata.");
    } finally { actionPending.current = false; setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">Fenice</p><h1 className="mt-2 text-3xl font-black">Tu scegli: Sì o No</h1></div>
          <Link href="/" className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-slate-300">Oggi</Link>
        </header>
        <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-5 text-sm leading-6 text-amber-100">
          <strong>Modalità simulazione.</strong> Il Sì prova la proposta con denaro virtuale. Nessun ordine viene inviato a Directa e nessun euro reale viene speso.
        </div>
        {error ? <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</p> : null}
        {history === null && rawHistory !== loadingHistory ? <p role="alert" className="rounded-xl border border-rose-400/30 p-4 text-sm text-rose-200">Il registro su questo dispositivo non è disponibile. Le conferme sono sospese.</p> : null}

        {!proposal ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-8">
            <p className="text-2xl font-black">Nessuna proposta da confermare</p>
            <p className="mt-3 text-sm leading-6 text-slate-400">{data.notices[0] ?? "Fenice mostrerà qui le proposte complete disponibili in simulazione."}</p>
            {data.notices.length > 1 ? <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-400">{data.notices.slice(1).map(item => <li key={item}>{item}</li>)}</ul> : null}
            {data.diagnosticCandidates?.length ? (
              <div className="mt-6 space-y-3">
                <div>
                  <p className="text-sm font-black text-slate-200">Più vicini a una proposta</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Solo diagnostica: questi titoli non sono proposte e qui non possono essere approvati.</p>
                </div>
                {data.diagnosticCandidates.slice(0, 3).map((candidate) => (
                  <article key={candidate.symbol} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-black text-slate-100">{candidate.symbol} · {candidate.name}</p>
                        <p className="mt-1 text-xs text-slate-500">Comitato {candidate.committeeDecision ?? "n/d"} · Terminale {candidate.terminalDecision ?? "n/d"}</p>
                      </div>
                      <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[10px] font-black text-amber-200">NON AZIONABILE</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-white/[0.04] p-2"><p className="text-[9px] uppercase text-slate-500">Score</p><p className="mt-1 font-black">{candidate.committeeScore ?? "—"}</p></div>
                      <div className="rounded-xl bg-white/[0.04] p-2"><p className="text-[9px] uppercase text-slate-500">Confidence</p><p className="mt-1 font-black">{candidate.calibratedConfidence ?? "—"}</p></div>
                      <div className="rounded-xl bg-white/[0.04] p-2"><p className="text-[9px] uppercase text-slate-500">Fonti PAPER</p><p className="mt-1 font-black">{candidate.independentSourceFamilies}/2</p></div>
                    </div>
                    {candidate.blockers.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-400">{candidate.blockers.slice(0, 4).map((code) => <li key={code}>{diagnosticBlockerCopy[code] ?? code}</li>)}</ul> : null}
                  </article>
                ))}
              </div>
            ) : null}
            <button onClick={() => { setDemo(createPaperReviewDemo()); setNow(Date.now()); setError(null); }} className="mt-6 rounded-xl bg-amber-300 px-5 py-4 text-sm font-black text-slate-950">Prova Sì / No con un esempio</button>
          </section>
        ) : (
          <section aria-labelledby="proposal-title" className="overflow-hidden rounded-3xl border border-white/15 bg-white/[0.04]">
            <div className="space-y-5 p-5 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full bg-sky-300/10 px-3 py-2 text-xs font-black text-sky-200">{proposal.scope === "DEMO" ? "ESEMPIO INVENTATO" : "PROPOSTA PAPER"}</span>
                <span className="text-sm text-slate-400">{decision ? "Risposta registrata" : remaining > 0 ? `Valida per ${remaining} secondi` : "Proposta scaduta"}</span>
              </div>
              <div><p className="text-sm font-bold text-slate-400">Acquisto simulato · {proposal.order.symbol}</p><h2 id="proposal-title" className="mt-2 text-2xl font-black sm:text-3xl">{proposal.name}</h2></div>
              <p className="text-sm leading-6 text-slate-300">{proposal.reason}</p>
              {!demo && data.reviewDataSource === "LIVE_READONLY"
                ? <p className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-xs font-bold text-emerald-100">Dati mercato aggiornati in sola lettura. Nessun ordine è stato inviato.</p>
                : null}
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-black/25 p-4"><dt className="text-xs text-slate-400">Quantità simulata</dt><dd className="mt-2 text-xl font-black">{Number.isFinite(proposal.order.quantity) && proposal.order.quantity > 0 ? number.format(proposal.order.quantity) : "Non disponibile"}</dd></div>
                <div className="rounded-2xl bg-black/25 p-4"><dt className="text-xs text-slate-400">Prezzo massimo per unità</dt><dd className="mt-2 text-xl font-black">{Number.isFinite(proposal.order.limitPrice) ? `${number.format(proposal.order.limitPrice!)} ${proposal.order.currency}` : "Non disponibile"}</dd></div>
                <div className="rounded-2xl bg-black/25 p-4"><dt className="text-xs text-slate-400">Costi simulati stimati</dt><dd className="mt-2 text-xl font-black">{euroOrUnknown(proposal.estimatedFeeEuro)}</dd></div>
                <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4"><dt className="text-xs text-amber-100">Totale massimo stimato</dt><dd className="mt-2 text-xl font-black text-amber-300">{euroOrUnknown(proposal.maxTotalEuro)}</dd></div>
              </dl>
              <p className="text-xs leading-5 text-slate-400">Capitale del laboratorio: {euroOrUnknown(proposal.context.capitalEuro)}. I costi sono quelli del simulatore; non sono un preventivo Directa. Le quantità frazionarie PAPER non attestano la negoziabilità presso il broker.</p>
              {proposal.evidence ? <div className="rounded-xl border border-white/10 p-4 text-xs leading-6 text-slate-400">
                <p className="font-bold text-slate-300">Fonti verificate per questa proposta</p>
                {proposal.evidence.quotes.map(quote => <p key={quote.sourceFamily}>{quote.sourceFamily} · {number.format(quote.price)} {proposal.order.currency} · {new Date(quote.observedAt).toLocaleTimeString("it-IT")}</p>)}
                <p>Cambio in euro: {number.format(proposal.context.fxToEuro)} · Sessione verificata alle {new Date(proposal.evidence.sessionObservedAt).toLocaleTimeString("it-IT")}</p>
              </div> : null}
              {proposal.aiDecision ? <div className="rounded-xl border border-sky-300/20 bg-sky-300/5 p-4 text-sm text-sky-100">
                <p className="font-bold">Tesi IA da valutare · FSI {proposal.aiDecision.thesis.fsiScore}/100</p>
                <p className="mt-2">Orizzonte: {proposal.aiDecision.thesis.horizon}</p>
                <ul className="mt-2 list-disc pl-5">{proposal.aiDecision.thesis.rationale.map(item => <li key={item}>{item}</li>)}</ul>
                <p className="mt-2 font-bold">Quando rivalutarla</p>
                <ul className="mt-2 list-disc pl-5">{proposal.aiDecision.thesis.invalidation.map(item => <li key={item}>{item}</li>)}</ul>
              </div> : null}
              {!demo && proposal.scope === "PAPER_QUEUE" && !decision
                ? <p className="rounded-xl border border-sky-300/30 bg-sky-300/10 px-4 py-3 text-sm text-sky-100">Il refresh diretto delle API dal browser è sospeso per proteggere sicurezza e quote gratuite. Il laboratorio usa dati PAPER archiviati; il Sì resta bloccato senza una verifica autorizzata. Nessun ordine reale viene inviato.</p>
                : null}
              {proposal.blockers.length > 0 ? <div className="rounded-xl border border-rose-300/20 bg-rose-300/10 p-4"><p className="font-bold text-rose-200">Conferma sospesa</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-100">{proposal.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
              {decision ? (
                <div role="status" className={`rounded-2xl border p-5 ${decision.answer === "YES" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-slate-400/25 bg-slate-400/10 text-slate-200"}`}>
                  <p className="text-xl font-black">{decision.answer === "YES" ? "Sì registrato · simulazione completata" : "No registrato · proposta rifiutata"}</p>
                  <p className="mt-2 text-sm">{decision.execution ? `Importo simulato con i costi: ${euro.format(decision.execution.notionalEuro + decision.execution.estimatedFeeEuro)}. ` : ""}Nessun acquisto reale effettuato.</p>
                </div>
              ) : <p className="text-center text-lg font-bold">Vuoi provare questa proposta in simulazione?</p>}
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-white/10 bg-black/20 p-5 sm:px-8">
              <button type="button" disabled={!eligible || busy} onClick={() => void answer("YES")} style={{ fontSize: "2rem", fontWeight: 900 }} className="min-h-20 rounded-2xl bg-emerald-300 text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Sì, approva solo la simulazione">Sì</button>
              <button type="button" disabled={busy || Boolean(decision) || history === null} onClick={() => void answer("NO")} style={{ fontSize: "2rem", fontWeight: 900 }} className="min-h-20 rounded-2xl border-2 border-slate-400/40 bg-slate-800 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30" aria-label="No, rifiuta la proposta">No</button>
            </div>
          </section>
        )}
        {demo ? <button disabled={busy} onClick={() => { setDemo(null); setError(null); }} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-slate-300">Esci dall’esempio</button> : null}
        {!demo && proposals.length > 1 ? <nav aria-label="Altre proposte" className="flex flex-wrap gap-2">{proposals.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} disabled={busy} className={`rounded-xl border px-4 py-3 text-sm ${item.id === proposal?.id ? "border-amber-300 text-amber-300" : "border-white/15 text-slate-400"}`}>{item.order.symbol}</button>)}</nav> : null}
        <p className="text-xs leading-5 text-slate-500">Ogni Sì vale per una sola proposta e per i dettagli mostrati. Le decisioni restano su questo dispositivo. Queste prove sono separate dalla campagna PAPER e non ne aumentano la certificazione.</p>
        {history && history.length > 0 ? <details className="rounded-2xl border border-white/10 p-5"><summary className="cursor-pointer text-sm font-bold text-slate-300">Ultime risposte ({history.length})</summary><ul className="mt-4 space-y-3 text-sm text-slate-400">{history.slice(-5).reverse().map((record) => <li key={record.proposalId}>{record.scope === "DEMO" ? "Esempio" : "Proposta PAPER"} · {record.answer === "YES" ? "Sì" : "No"} · {new Date(record.decidedAt).toLocaleString("it-IT")} · nessun invio al broker</li>)}</ul></details> : null}
      </div>
    </main>
  );
}
