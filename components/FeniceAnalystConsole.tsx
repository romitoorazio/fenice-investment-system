"use client";

import { useState } from "react";
import type { AnalystReply } from "@/lib/ui/fenice-grounded-analyst";
import FeniceGenerativePanel from "@/components/FeniceGenerativePanel";

const quickQuestions = [
  "Stato Fenice oggi",
  "Perché non comprare ASML?",
  "Controlla i rischi",
  "Certificazione PAPER",
  "Guadagni e performance",
];

export default function FeniceAnalystConsole({ initialReply }: { initialReply: AnalystReply }) {
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("Stato Fenice oggi");
  const [reply, setReply] = useState<AnalystReply>(initialReply);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask(message: string) {
    const clean = message.trim();
    if (busy || clean.length < 2 || clean.length > 240) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/analista", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: clean }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Analisi non disponibile: controllo dati necessario.");
      const result = await response.json() as AnalystReply;
      if (result.brokerOrderAllowed !== false || result.providerCalls !== 0) {
        throw new Error("Risposta non conforme ai controlli di sicurezza.");
      }
      setReply(result);
      setQuestion(clean);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile verificare la risposta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4 sm:p-6">
        <h2 className="text-sm font-black text-cyan-200">Chiedi all&apos;analista Fenice</h2>
        <p className="mt-2 text-xs leading-5 text-slate-300">
          Motore di interpretazione dei dati di Fenice: interattivo, tracciabile e senza chiamate API a pagamento.
          Non è un modello generativo collegato a internet e non può inviare ordini.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {quickQuestions.map(item => (
            <button
              key={item}
              type="button"
              disabled={busy}
              onClick={() => void ask(item)}
              className="rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-100 transition hover:border-cyan-300/40 disabled:opacity-40"
            >
              {item}
            </button>
          ))}
        </div>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={event => {
          event.preventDefault();
          void ask(draft);
        }}>
          <label className="sr-only" htmlFor="fenice-analyst-question">Domanda sui titoli e sulla sicurezza</label>
          <input
            id="fenice-analyst-question"
            value={draft}
            maxLength={240}
            onChange={event => setDraft(event.target.value)}
            placeholder="Perché Fenice non compra QQQ?"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-white/20 bg-slate-900 p-3 text-sm text-white outline-none focus:border-cyan-300"
          />
          <button
            type="submit"
            disabled={busy || draft.trim().length < 2}
            className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Analisi in corso..." : "Analizza"}
          </button>
        </form>
        {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
      </section>

      <section aria-live="polite" className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Domanda: {question}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-md border border-amber-300/30 px-3 py-1 text-xs font-black text-amber-200">
            {reply.verdict}
          </span>
          <span className="text-xs text-slate-400">Solo ricerca · ordini reali bloccati</span>
        </div>
        <h2 className="mt-3 text-xl font-black text-white">{reply.title}</h2>
        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
          {reply.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
        <div className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/[0.04] p-4">
          <h3 className="text-sm font-black text-rose-200">Blocchi e cose non dimostrate</h3>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-300">
            {reply.blockers.map((blocker, index) => <li key={index}>• {blocker}</li>)}
          </ul>
        </div>
      </section>

      <FeniceGenerativePanel key={question + "|" + reply.generatedAt} question={question} grounded={reply} />

      <section className="rounded-2xl border border-white/10 p-5">
        <h2 className="text-sm font-black">Prove verificabili</h2>
        <p className="mt-1 text-xs text-slate-400">
          Risposta prodotta: {reply.generatedAt} · Snapshot del comitato: {reply.sourceTimestamp ?? "non valido/scaduto"}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {reply.evidence.map((item, i) => (
            <div key={item.label + i} className="rounded-lg bg-white/[0.04] p-3">
              <p className="text-xs text-slate-400">{item.label}</p>
              <p className="mt-1 font-bold text-white">{item.value}</p>
              <p className="mt-1 break-all text-[10px] text-slate-500">{item.source}</p>
            </div>
          ))}
        </div>
        <nav className="mt-4 flex flex-wrap gap-3">
          {reply.links.map(link => (
            <a key={link.href} className="text-sm font-bold text-cyan-300 underline" href={link.href}>
              {link.label} →
            </a>
          ))}
        </nav>
      </section>
    </div>
  );
}
