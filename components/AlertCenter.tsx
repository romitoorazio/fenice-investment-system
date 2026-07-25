"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { TerminalAlert } from "@/lib/terminal";

type AlertReport = {
  version: number;
  generatedAt: string;
  alerts: TerminalAlert[];
};

function severityClass(severity: TerminalAlert["severity"]) {
  if (severity === "critico") return "border-rose-400/25 bg-rose-400/[0.07] text-rose-100";
  if (severity === "attenzione") return "border-amber-300/25 bg-amber-300/[0.07] text-amber-100";
  return "border-sky-400/25 bg-sky-400/[0.07] text-sky-100";
}

export default function AlertCenter() {
  const [report, setReport] = useState<AlertReport | null>(null);
  const [error, setError] = useState("");
  const [severity, setSeverity] = useState("TUTTE");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/alerts", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as AlertReport;
        if (active) {
          setReport(data);
          setError("");
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Alert Center non disponibile");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (report?.alerts ?? []).filter((alert) => {
      const severityMatch = severity === "TUTTE" || alert.severity === severity;
      const textMatch = !normalized || `${alert.symbol ?? ""} ${alert.title} ${alert.detail} ${alert.type}`.toLowerCase().includes(normalized);
      return severityMatch && textMatch;
    });
  }, [report, query, severity]);

  if (!report) return <main className="min-h-screen bg-slate-950 p-8 text-white">Fenice sta caricando gli alert… {error}</main>;

  const critical = report.alerts.filter((alert) => alert.severity === "critico").length;
  const attention = report.alerts.filter((alert) => alert.severity === "attenzione").length;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">Fenice Alert Center</p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">Cambi di segnale sotto controllo</h1>
              <p className="mt-4 max-w-4xl leading-7 text-slate-300">Registra automaticamente variazioni di decisione, trend, punteggio, prezzo e freschezza. Gli alert spiegano cosa è cambiato; non inviano ordini.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Mission Control</Link>
              <Link href="/terminal" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">World Terminal →</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Alert archiviati", String(report.alerts.length)],
            ["Critici", String(critical)],
            ["Attenzione", String(attention)],
            ["Ultimo ciclo", new Date(report.generatedAt).toLocaleString("it-IT")],
          ].map(([label, value]) => <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-3 text-xl font-black">{value}</p></article>)}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca simbolo, evento o dettaglio" className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-rose-300" />
            <select value={severity} onChange={(event) => setSeverity(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-rose-300">
              <option value="TUTTE">Tutte le gravità</option>
              <option value="critico">Critico</option>
              <option value="attenzione">Attenzione</option>
              <option value="informazione">Informazione</option>
            </select>
          </div>
        </section>

        <section className="space-y-4">
          {filtered.map((alert) => (
            <article key={alert.id} className={`rounded-2xl border p-5 ${severityClass(alert.severity)}`}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider opacity-80">
                    <span>{alert.severity}</span><span>·</span><span>{alert.type}</span>{alert.symbol ? <><span>·</span><span>{alert.symbol}</span></> : null}
                  </div>
                  <h2 className="mt-2 text-lg font-black">{alert.title}</h2>
                  <p className="mt-3 text-sm leading-6 opacity-80">{alert.detail}</p>
                </div>
                <time className="text-xs opacity-60">{new Date(alert.generatedAt).toLocaleString("it-IT")}</time>
              </div>
              {alert.previous !== undefined || alert.current !== undefined ? <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-slate-950/50 px-3 py-2">Prima: {String(alert.previous ?? "—")}</span><span className="rounded-lg bg-slate-950/50 px-3 py-2">Ora: {String(alert.current ?? "—")}</span></div> : null}
            </article>
          ))}
          {!filtered.length ? <div className="rounded-2xl border border-white/10 p-8 text-center text-slate-500">Nessun alert corrisponde ai filtri.</div> : null}
        </section>

        <footer className="pb-8 text-center text-xs leading-5 text-slate-500">Gli alert Fenice sono controlli informativi. Ogni operazione resta subordinata alla verifica umana.</footer>
      </div>
    </main>
  );
}
