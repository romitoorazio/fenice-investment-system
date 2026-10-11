"use client";

import { useEffect, useState } from "react";
import type { AnalystReply } from "@/lib/ui/fenice-grounded-analyst";

type Status = {
  state: "READY" | "SETUP_REQUIRED";
  model?: string;
  explanation?: string;
  ownerAccessRequired?: boolean;
  costMetered?: boolean;
};
type Result = {
  state: "GENERATED" | "UNAVAILABLE" | "BAD_RESPONSE";
  explanation: string | null;
  committeeVerdict: string;
  brokerOrderAllowed: false;
  sourceTimestamp: string | null;
  model: string | null;
  note: string;
  grounded: AnalystReply;
};

export default function FeniceGenerativePanel({ question, grounded }: { question: string; grounded: AnalystReply }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        const res = await fetch("/api/analista-generativa", { cache: "no-store" });
        const json = await res.json() as Status;
        if (alive) setStatus(json);
      } catch {
        if (alive) setStatus({ state: "SETUP_REQUIRED", explanation: "Stato Gateway non disponibile." });
      }
    }
    void check();
    return () => { alive = false; };
  }, []);

  async function generate() {
    if (status?.state !== "READY" || generating || accessToken.length < 32) return;
    setGenerating(true);
    setError("");
    setGenerated(null);
    try {
      // The owner key exists only in local component state; no localStorage,
      // URL parameters, logs or cookies.
      const res = await fetch("/api/analista-generativa", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + accessToken },
        body: JSON.stringify({ question }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(res.status === 401
        ? "Codice proprietario non valido." : "Collegamento OpenAI, crediti o dati non disponibili.");
      const payload = await res.json() as Result;
      if (payload.brokerOrderAllowed !== false || payload.committeeVerdict !== payload.grounded.verdict
          || payload.committeeVerdict !== grounded.verdict) {
        throw new Error("Risposta non coerente con il comitato. L'IA non è autorizzata a cambiare segnali.");
      }
      setGenerated(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Risposta generativa non disponibile.");
    } finally {
      setGenerating(false);
      setAccessToken("");
    }
  }

  return (
    <section className="rounded-2xl border border-violet-300/25 bg-violet-300/[0.04] p-5 sm:p-6">
      <h2 className="text-lg font-black text-violet-200">IA generativa · Spiega le decisioni</h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        Quando attiva, il modello genera spiegazioni sulla base delle prove verificate qui sotto.
        Non legge il conto Directa, non aggiorna prezzi e non decide gli ordini.
      </p>
      <p className="mt-2 text-xs text-amber-200">Ogni clic può consumare una piccola quantità di API OpenAI già usate dalla pizzeria. Nessuna richiesta è automatica; il modello è economico e la risposta è breve.</p>
      {status?.state === "READY" ? (
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-slate-300" htmlFor="fenice-ai-owner-key">
            Codice di accesso del proprietario (non viene salvato nel browser)
          </label>
          <input
            id="fenice-ai-owner-key"
            type="password"
            autoComplete="off"
            value={accessToken}
            onChange={event => setAccessToken(event.target.value.slice(0, 256))}
            className="w-full max-w-lg rounded-xl border border-white/20 bg-slate-900 p-3 text-sm text-white"
            placeholder="Codice riservato"
          />
          <button type="button" onClick={() => void generate()}
            disabled={generating || accessToken.length < 32 || grounded.intent === "UNSUPPORTED"}
            className="rounded-xl bg-violet-300 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">
            {generating ? "Generazione in corso..." : "Spiegami con IA generativa"}
          </button>
          <p className="text-xs text-slate-400">Modello configurato: {status.model}</p>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-amber-300/25 bg-black/20 p-4 text-sm text-amber-100">
          <p className="font-bold">Configurazione dell&apos;IA generativa non ancora completa.</p>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            Serve il collegamento protetto al servizio OpenAI già usato dalla pizzeria.
            L&apos;analista gratuito basato sui dati continua a funzionare.
          </p>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p>}
      {generated && (
        <div aria-live="polite" className="mt-5 rounded-xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs font-bold text-violet-200">
            {generated.state === "GENERATED" ? "Testo generato · sottoposto ai controlli Fenice" : "Generazione non disponibile"}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-100">{generated.explanation ?? generated.note}</p>
          <p className="mt-3 text-xs font-bold text-amber-200">
            Verdetto ufficiale immutato: {grounded.verdict} · Nessun ordine autorizzato
          </p>
          <p className="mt-1 text-xs text-slate-400">Il testo generativo può contenere errori. {generated.note}</p>
        </div>
      )}
    </section>
  );
}
