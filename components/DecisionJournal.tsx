"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { JournalAction, JournalEntry, JournalStatus } from "@/lib/journal";
import type { TerminalReport, UnifiedAsset } from "@/lib/terminal";

const STORAGE_KEY = "fenice-decision-journal-v1";
const number = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

function today(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function actionFor(asset?: UnifiedAsset): JournalAction {
  if (!asset) return "OSSERVA";
  if (asset.decision === "ACCUMULA") return "COMPRA";
  if (asset.decision === "MANTIENI") return "MANTIENI";
  if (asset.decision === "EVITA") return "EVITA";
  return "OSSERVA";
}

function disciplineScore(entry: JournalEntry) {
  const checks = [
    entry.thesis.trim().length >= 20,
    entry.catalyst.trim().length >= 10,
    entry.invalidation.trim().length >= 10,
    entry.reviewDate.length > 0,
    entry.riskBudgetPercent > 0,
    Number.isFinite(entry.entryPrice),
    entry.snapshot.confidence >= 60,
    entry.snapshot.price !== undefined,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function statusClass(status: JournalStatus) {
  if (status === "CONFERMATO") return "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200";
  if (status === "INVALIDATO") return "border-rose-400/25 bg-rose-400/[0.07] text-rose-200";
  if (status === "CHIUSO") return "border-slate-400/20 bg-slate-400/[0.07] text-slate-200";
  return "border-amber-300/25 bg-amber-300/[0.07] text-amber-100";
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function DecisionJournal() {
  const [terminal, setTerminal] = useState<TerminalReport | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [symbol, setSymbol] = useState("");
  const [action, setAction] = useState<JournalAction>("OSSERVA");
  const [horizon, setHorizon] = useState<JournalEntry["horizon"]>("12 mesi");
  const [thesis, setThesis] = useState("");
  const [catalyst, setCatalyst] = useState("");
  const [invalidation, setInvalidation] = useState("");
  const [riskBudget, setRiskBudget] = useState("2");
  const [entryPrice, setEntryPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [reviewDate, setReviewDate] = useState(today(30));
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState("TUTTI");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setEntries(JSON.parse(stored) as JournalEntry[]);
    } catch {
      setError("Il registro salvato nel browser non è leggibile.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries, loaded]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/terminal", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as TerminalReport;
        if (!active) return;
        setTerminal(data);
        const first = data.assets[0];
        setSymbol((current) => current || first?.symbol || "");
        setError("");
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Terminale non disponibile");
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const asset = terminal?.assets.find((item) => item.symbol === symbol);

  useEffect(() => {
    if (!asset) return;
    setAction(actionFor(asset));
    setEntryPrice(Number.isFinite(asset.price) ? String(asset.price) : "");
    setTargetPrice(Number.isFinite(asset.valuation.fairValueBase) ? String(asset.valuation.fairValueBase) : "");
    setThesis(asset.reason);
    setInvalidation(
      asset.technical.signal === "NEGATIVO"
        ? "La tesi resta sospesa finché il segnale tecnico non migliora."
        : `Invalidare se il Fenice Score scende sotto 48 o la decisione passa a EVITA.`,
    );
  }, [asset]);

  const filtered = useMemo(() => entries
    .filter((entry) => filter === "TUTTI" || entry.status === filter)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))), [entries, filter]);

  const stats = useMemo(() => {
    const closed = entries.filter((entry) => entry.outcome);
    const positive = closed.filter((entry) => entry.outcome?.result === "POSITIVO").length;
    const averageReturn = closed.length
      ? closed.reduce((sum, entry) => sum + Number(entry.outcome?.returnPercent || 0), 0) / closed.length
      : 0;
    const averageDiscipline = entries.length ? entries.reduce((sum, entry) => sum + disciplineScore(entry), 0) / entries.length : 0;
    const overdue = entries.filter((entry) => entry.status === "APERTO" && entry.reviewDate < today()).length;
    return { closed: closed.length, positive, averageReturn, averageDiscipline, overdue };
  }, [entries]);

  function createEntry() {
    if (!terminal || !asset) {
      setError("Seleziona uno strumento disponibile nel World Terminal.");
      return;
    }
    const parsedRisk = Number(riskBudget.replace(",", "."));
    if (!thesis.trim() || !invalidation.trim() || !reviewDate || !Number.isFinite(parsedRisk) || parsedRisk <= 0) {
      setError("Tesi, invalidazione, rischio e data di revisione sono obbligatori.");
      return;
    }
    const now = new Date().toISOString();
    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      symbol: asset.symbol,
      name: asset.name,
      action,
      status: "APERTO",
      horizon,
      thesis: thesis.trim(),
      catalyst: catalyst.trim(),
      invalidation: invalidation.trim(),
      riskBudgetPercent: parsedRisk,
      ...(Number.isFinite(Number(entryPrice)) ? { entryPrice: Number(entryPrice) } : {}),
      ...(Number.isFinite(Number(targetPrice)) ? { targetPrice: Number(targetPrice) } : {}),
      ...(Number.isFinite(Number(stopPrice)) ? { stopPrice: Number(stopPrice) } : {}),
      reviewDate,
      notes: notes.trim(),
      snapshot: {
        generatedAt: terminal.generatedAt,
        marketRegime: terminal.marketRegime,
        terminalDecision: asset.decision,
        technicalSignal: asset.technical.signal,
        unifiedScore: asset.unifiedScore,
        fundamentalScore: asset.fundamentalScore,
        technicalScore: asset.technicalScore,
        valuationScore: asset.valuationScore,
        riskScore: asset.riskScore,
        confidence: asset.confidence,
        price: asset.price,
        currency: asset.currency,
        fairValueBase: asset.valuation.fairValueBase,
        fairValueCurrency: asset.valuation.currency,
        targetWeightPercent: asset.targetWeightPercent,
      },
    };
    setEntries((current) => [entry, ...current]);
    setCatalyst("");
    setNotes("");
    setError("");
  }

  function updateStatus(id: string, status: JournalStatus) {
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, status, updatedAt: new Date().toISOString() } : entry));
  }

  function closeEntry(entry: JournalEntry) {
    const raw = window.prompt(`Prezzo finale per ${entry.symbol}`, entry.snapshot.price ? String(entry.snapshot.price) : "");
    if (raw === null) return;
    const exitPrice = Number(raw.replace(",", "."));
    if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
      setError("Prezzo finale non valido.");
      return;
    }
    const base = Number(entry.entryPrice ?? entry.snapshot.price);
    const returnPercent = Number.isFinite(base) && base > 0 ? ((exitPrice / base) - 1) * 100 : 0;
    const lesson = window.prompt("Qual è la lezione principale?", "") ?? "";
    setEntries((current) => current.map((item) => item.id === entry.id ? {
      ...item,
      status: "CHIUSO",
      updatedAt: new Date().toISOString(),
      outcome: {
        closedAt: new Date().toISOString(),
        exitPrice,
        returnPercent: Math.round(returnPercent * 100) / 100,
        result: returnPercent > 1 ? "POSITIVO" : returnPercent < -1 ? "NEGATIVO" : "NEUTRALE",
        lesson: lesson.trim(),
      },
    } : item));
    setError("");
  }

  function exportJson() {
    download(`fenice-journal-${today()}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries }, null, 2), "application/json");
  }

  function exportCsv() {
    const header = ["data", "simbolo", "azione", "stato", "orizzonte", "score", "rischio", "confidenza", "prezzo_ingresso", "prezzo_uscita", "rendimento_percento", "tesi", "invalidazione", "lezione"];
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = entries.map((entry) => [
      entry.createdAt, entry.symbol, entry.action, entry.status, entry.horizon, entry.snapshot.unifiedScore,
      entry.snapshot.riskScore, entry.snapshot.confidence, entry.entryPrice, entry.outcome?.exitPrice,
      entry.outcome?.returnPercent, entry.thesis, entry.invalidation, entry.outcome?.lesson,
    ].map(escape).join(";"));
    download(`fenice-journal-${today()}.csv`, [header.join(";"), ...lines].join("\n"), "text/csv;charset=utf-8");
  }

  async function importJson(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as { entries?: JournalEntry[] } | JournalEntry[];
      const next = Array.isArray(parsed) ? parsed : parsed.entries;
      if (!Array.isArray(next)) throw new Error("Formato non valido");
      setEntries(next);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Importazione non riuscita");
    }
  }

  if (!terminal) return <main className="min-h-screen bg-slate-950 p-8 text-white">Fenice sta caricando il Decision Journal… {error}</main>;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-[1400px] space-y-8">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-300">Fenice Decision Journal</p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">Misura il processo, non soltanto il risultato</h1>
              <p className="mt-4 max-w-4xl leading-7 text-slate-300">Ogni voce congela il contesto Fenice del momento. In seguito potrai verificare se la tesi, il rischio e l’invalidazione erano ben definiti, anche quando il mercato ha avuto un esito casuale.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Mission Control</Link>
              <Link href="/terminal" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">World Terminal</Link>
              <Link href="/portfolio" className="rounded-xl bg-sky-400 px-4 py-3 text-sm font-black text-slate-950">Paper Portfolio</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["Decisioni", entries.length],
            ["Chiuse", stats.closed],
            ["Positive", stats.positive],
            ["Rendimento medio", `${number.format(stats.averageReturn)}%`],
            ["Disciplina media", `${Math.round(stats.averageDiscipline)}/100`],
            ["Revisioni scadute", stats.overdue],
          ].map(([label, value]) => <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-3 text-xl font-black">{value}</p></article>)}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-2xl font-black">Registra una decisione</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-4">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Strumento
              <select value={symbol} onChange={(event) => setSymbol(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white">
                {terminal.assets.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol} · {item.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Azione
              <select value={action} onChange={(event) => setAction(event.target.value as JournalAction)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white">
                {(["COMPRA", "MANTIENI", "OSSERVA", "EVITA", "VENDI"] as JournalAction[]).map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Orizzonte
              <select value={horizon} onChange={(event) => setHorizon(event.target.value as JournalEntry["horizon"])} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white">
                {(["1-4 settimane", "3 mesi", "12 mesi", "3-10 anni"] as JournalEntry["horizon"][]).map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Rischio massimo (%)
              <input value={riskBudget} onChange={(event) => setRiskBudget(event.target.value)} inputMode="decimal" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white" />
            </label>
          </div>

          {asset ? <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Decisione Fenice", asset.decision], ["Score", asset.unifiedScore], ["Rischio", asset.riskScore],
              ["Confidenza", asset.confidence], ["Segnale", asset.technical.signal], ["Peso modello", `${asset.targetWeightPercent}%`],
            ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-950/60 p-3"><p className="text-[10px] uppercase text-slate-500">{label}</p><p className="mt-2 font-black">{value}</p></div>)}
          </div> : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tesi
              <textarea value={thesis} onChange={(event) => setThesis(event.target.value)} rows={5} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm normal-case text-white" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Catalizzatore atteso
              <textarea value={catalyst} onChange={(event) => setCatalyst(event.target.value)} rows={5} placeholder="Trimestrale, approvazione, cambio di trend…" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm normal-case text-white" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Condizione di invalidazione
              <textarea value={invalidation} onChange={(event) => setInvalidation(event.target.value)} rows={5} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm normal-case text-white" />
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Prezzo ingresso
              <input value={entryPrice} onChange={(event) => setEntryPrice(event.target.value)} inputMode="decimal" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Target
              <input value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} inputMode="decimal" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Stop / invalidazione prezzo
              <input value={stopPrice} onChange={(event) => setStopPrice(event.target.value)} inputMode="decimal" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Data revisione
              <input type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Note
              <input value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white" />
            </label>
          </div>
          <button type="button" onClick={createEntry} className="mt-5 w-full rounded-xl bg-violet-400 px-5 py-4 font-black text-slate-950 hover:bg-violet-300">Congela questa decisione nel Journal</button>
          {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        </section>

        <section className="flex flex-col justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5 md:flex-row md:items-center">
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm">
            <option value="TUTTI">Tutti gli stati</option><option value="APERTO">Aperti</option><option value="CONFERMATO">Confermati</option><option value="INVALIDATO">Invalidati</option><option value="CHIUSO">Chiusi</option>
          </select>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportJson} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Esporta JSON</button>
            <button type="button" onClick={exportCsv} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Esporta CSV</button>
            <label className="cursor-pointer rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Importa backup<input type="file" accept="application/json,.json" className="hidden" onChange={(event) => event.target.files?.[0] && void importJson(event.target.files[0])} /></label>
          </div>
        </section>

        <section className="space-y-5">
          {filtered.map((entry) => {
            const discipline = disciplineScore(entry);
            const overdue = entry.status === "APERTO" && entry.reviewDate < today();
            return <article key={entry.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><p className="text-2xl font-black text-violet-300">{entry.symbol}</p><span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(entry.status)}`}>{entry.status}</span><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black">{entry.action}</span>{overdue ? <span className="rounded-full bg-rose-400/10 px-3 py-1 text-xs font-black text-rose-300">REVISIONE SCADUTA</span> : null}</div>
                  <h2 className="mt-2 text-lg font-black">{entry.name}</h2>
                  <p className="mt-1 text-xs text-slate-500">Creata {new Date(entry.createdAt).toLocaleString("it-IT")} · revisione {new Date(`${entry.reviewDate}T12:00:00`).toLocaleDateString("it-IT")} · {entry.horizon}</p>
                </div>
                <div className="rounded-2xl bg-slate-950/60 px-5 py-4 text-center"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Disciplina</p><p className={`mt-1 text-3xl font-black ${discipline >= 75 ? "text-emerald-300" : discipline >= 50 ? "text-amber-300" : "text-rose-300"}`}>{discipline}</p></div>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl bg-emerald-400/[0.04] p-4"><p className="text-xs font-black uppercase text-emerald-300">Tesi</p><p className="mt-3 text-sm leading-6 text-slate-300">{entry.thesis}</p></div>
                <div className="rounded-2xl bg-sky-400/[0.04] p-4"><p className="text-xs font-black uppercase text-sky-300">Catalizzatore</p><p className="mt-3 text-sm leading-6 text-slate-300">{entry.catalyst || "Non specificato"}</p></div>
                <div className="rounded-2xl bg-rose-400/[0.04] p-4"><p className="text-xs font-black uppercase text-rose-300">Invalidazione</p><p className="mt-3 text-sm leading-6 text-slate-300">{entry.invalidation}</p></div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                {[
                  ["Score", entry.snapshot.unifiedScore], ["Rischio", entry.snapshot.riskScore], ["Confidenza", entry.snapshot.confidence], ["Segnale", entry.snapshot.technicalSignal],
                  ["Ingresso", entry.entryPrice ?? "—"], ["Target", entry.targetPrice ?? "—"], ["Stop", entry.stopPrice ?? "—"], ["Rischio max", `${entry.riskBudgetPercent}%`],
                ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-950/60 p-3"><p className="text-[10px] uppercase text-slate-500">{label}</p><p className="mt-2 font-black">{value}</p></div>)}
              </div>
              {entry.outcome ? <div className="mt-4 rounded-2xl border border-white/10 p-4"><p className="text-xs font-black uppercase text-violet-300">Esito {entry.outcome.result}</p><p className="mt-2 font-black">Rendimento: {number.format(entry.outcome.returnPercent ?? 0)}%</p><p className="mt-2 text-sm text-slate-400">Lezione: {entry.outcome.lesson || "Non registrata"}</p></div> : null}
              <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                {entry.status !== "CHIUSO" ? <><button type="button" onClick={() => updateStatus(entry.id, "CONFERMATO")} className="rounded-lg bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-300">Conferma tesi</button><button type="button" onClick={() => updateStatus(entry.id, "INVALIDATO")} className="rounded-lg bg-rose-400/10 px-3 py-2 text-xs font-black text-rose-300">Invalida tesi</button><button type="button" onClick={() => closeEntry(entry)} className="rounded-lg bg-violet-400/10 px-3 py-2 text-xs font-black text-violet-300">Chiudi e valuta</button></> : null}
                <button type="button" onClick={() => setEntries((current) => current.filter((item) => item.id !== entry.id))} className="ml-auto rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-slate-400">Elimina</button>
              </div>
            </article>;
          })}
          {!filtered.length ? <div className="rounded-2xl border border-white/10 p-10 text-center text-slate-500">Nessuna decisione registrata.</div> : null}
        </section>

        <footer className="pb-8 text-center text-xs leading-5 text-slate-500">Il Journal è salvato solo nel browser corrente. Esporta periodicamente un backup JSON.</footer>
      </div>
    </main>
  );
}
