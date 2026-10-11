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
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
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
        if (json.state === "READY") {
          const sessionResponse = await fetch("/api/analista-generativa/session", { cache: "no-store" });
          const session = await sessionResponse.json() as { authenticated: boolean };
          if (alive) setAuthenticated(sessionResponse.ok && session.authenticated === true);
        }
      } catch {
        if (alive) setStatus({ state: "SETUP_REQUIRED", explanation: "Stato servizio OpenAI non disponibile." });
      } finally {
        if (alive) setCheckingSession(false);
      }
    }
    void check();
    return () => { alive = false; };
  }, []);

  async function login() {
    if (status?.state !== "READY" || accessToken.length < 32 || generating) return;
    setError("");
    setGenerating(true);
    try {
      const res = await fetch("/api/analista-generativa/session", {
        method: "POST",
        headers: { "Authorization": "Bearer " + accessToken },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(res.status === 401 ? "Codice proprietario non valido." : "Impossibile autorizzare la sessione.");
      setAuthenticated(true);
      setAccessToken("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accesso non riuscito.");
    } finally {
      setGenerating(false);
    }
  }

  async function logout() {
    setError("");
    try {
      await fetch("/api/analista-generativa/session", { method: "DELETE", cache: "no-store" });
    } catch {
      setError("Sessione non chiusa: riprova o cancella i cookie del sito.");
      return;
    }
    setAuthenticated(false);
    setGenerated(null);
    setAccessToken("");
  }

  async function generate() {
    if (status?.state !== "READY" || generating || !authenticated) return;
    setGenerating(true);
    setError("");
    setGenerated(null);
    try {
      // The browser sends only an HttpOnly signed session cookie, never the
      // owner code or the OpenAI key to this generation endpoint.
      const res = await fetch("/api/analista-generativa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 401) setAuthenticated(false);
        throw new Error(res.status === 401
          ? "Sessione scaduta: inserisci di nuovo il codice."
          : "OpenAI, credito o dati non disponibili.");
      }
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
    }
  }

  return (
    <section className="rounded-2xl border border-violet-300/25 bg-violet-300/[0.04] p-5 sm:p-6">
      <h2 className="text-lg font-black text-violet-200">IA generativa · Spiega le decisioni</h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        Quando attiva, OpenAI genera brevi spiegazioni sulla base delle prove verificate qui sotto.
        Non legge il conto Directa, non aggiorna prezzi e non decide gli ordini.
      </p>
      <p className="mt-2 text-xs text-amber-200">Solo le richieste confermate da te possono consumare crediti OpenAI. Modello economico, testo breve, nessuna chiamata automatica.</p>
      {status?.state === "READY" ? (
        <div className="mt-4 space-y-3">
          {checkingSession ? (
            <p className="text-xs text-slate-400">Verifica della sessione in corso...</p>
          ) : authenticated ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-emerald-200">
                Accesso autorizzato su questo browser per 8 ore dalla conferma.
              </p>
              <button type="button" onClick={() => void logout()}
                className="rounded-lg border border-white/20 px-3 py-2 text-xs text-slate-300">
                Disconnetti
              </button>
            </div>
          ) : (
            <>
              <label className="block text-xs text-slate-300" htmlFor="fenice-ai-owner-key">
                Inserisci il codice una volta ogni 8 ore (accesso temporaneo protetto)
              </label>
              <input id="fenice-ai-owner-key" type="password" autoComplete="off"
                value={accessToken}
                onChange={event => setAccessToken(event.target.value.slice(0, 256))}
                className="w-full max-w-lg rounded-xl border border-white/20 bg-slate-900 p-3 text-sm text-white"
                placeholder="Codice riservato"
              />
              <button type="button" onClick={() => void login()}
                disabled={generating || accessToken.length < 32}
                className="rounded-xl border border-violet-300/40 bg-violet-300 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">
                {generating ? "Verifica..." : "Accedi per 8 ore"}
              </button>
            </>
          )}
          <button type="button" onClick={() => void generate()}
            disabled={generating || !authenticated || checkingSession || grounded.intent === "UNSUPPORTED"}
            className="rounded-xl bg-violet-300 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">
            {generating ? "Generazione in corso..." : "Spiegami con IA generativa"}
          </button>
          <p className="text-xs text-slate-400">Modello configurato: {status.model}</p>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-amber-300/25 bg-black/20 p-4 text-sm text-amber-100">
          <p className="font-bold">Configurazione dell&apos;IA generativa non ancora completa.</p>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            Serve la configurazione privata delle API OpenAI e del codice proprietario nel progetto Fenice.
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
