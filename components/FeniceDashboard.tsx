"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  allocationTargets,
  companies,
  decisionRules,
  entryPlan,
  formatEuro,
  milestones,
  project,
  type TabId,
} from "../lib/fenice";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Piano 10 anni" },
  { id: "companies", label: "Aziende" },
  { id: "portfolio", label: "Allocazione" },
  { id: "roadmap", label: "Traguardi" },
  { id: "controls", label: "Controllo" },
];

function Card({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <article className="panel p-5">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <p className="mt-3 text-2xl font-black text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{note}</p>
    </article>
  );
}

function badge(action: string) {
  if (action === "ACCUMULA") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (action === "ATTENDI") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return "border-sky-400/30 bg-sky-400/10 text-sky-300";
}

export default function FeniceDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [capital, setCapital] = useState(project.initialCapital);
  const [capitalInput, setCapitalInput] = useState(String(project.initialCapital));
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("fenice-capital");
    if (!saved) return;
    const parsed = Number(saved);
    if (Number.isFinite(parsed) && parsed > 0) {
      setCapital(parsed);
      setCapitalInput(String(parsed));
    }
  }, []);

  const targetMultiple = useMemo(() => project.targetCapital / capital, [capital]);

  function saveCapital() {
    const parsed = Number(capitalInput.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMessage("Inserisci un capitale valido.");
      return;
    }
    setCapital(parsed);
    window.localStorage.setItem("fenice-capital", String(parsed));
    setMessage("Capitale aggiornato su questo dispositivo.");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-xl font-black text-slate-950">F</div>
            <div>
              <p className="font-black">{project.name}</p>
              <p className="text-xs text-slate-500">{project.goal} · orizzonte {project.horizonYears} anni</p>
            </div>
          </div>
          <Link href="/autonomia" className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-black text-slate-950">Autopilot →</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:py-8">
        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <nav className="flex gap-2 overflow-x-auto pb-2 lg:flex-col">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 rounded-xl px-4 py-3 text-left text-sm font-bold transition ${activeTab === tab.id ? "bg-amber-400 text-slate-950" : "border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="panel mt-5 hidden p-4 text-sm leading-6 text-slate-400 lg:block">{project.policy}</div>
        </aside>

        <section className="min-w-0">
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-amber-300">Missione definitiva</p>
                <h1 className="mt-2 text-3xl font-black sm:text-4xl">Da {formatEuro(capital)} a {formatEuro(project.targetCapital)} in dieci anni</h1>
                <p className="mt-3 max-w-4xl leading-7 text-slate-400">{project.mission}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card title="Capitale iniziale" value={formatEuro(capital)} note="Modificabile nel pannello Controllo." />
                <Card title="Obiettivo" value={formatEuro(project.targetCapital)} note={`Serve moltiplicare il capitale per ${targetMultiple.toFixed(1)} volte.`} />
                <Card title="Rendimento necessario" value={`${project.requiredCagr.toFixed(1)}% annuo`} note="Obiettivo molto ambizioso: non è garantito e richiede rischio elevato." />
                <Card title="Regola centrale" value="Nessun ordine automatico" note="Fenice analizza e propone; la decisione finale resta umana." />
              </div>

              <article className="panel p-5 sm:p-6">
                <h2 className="text-xl font-black">Struttura del capitale</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  {allocationTargets.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
                      <p className="text-3xl font-black text-amber-300">{item.weight}%</p>
                      <p className="mt-2 font-black">{item.label}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{item.role}</p>
                      <p className="mt-4 font-bold">{formatEuro((capital * item.weight) / 100)}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel p-5 sm:p-6">
                <h2 className="text-xl font-black">Ingresso progressivo nel primo anno</h2>
                <p className="mt-1 text-sm text-slate-500">Il piano evita di investire tutto in un solo momento.</p>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {entryPlan.map((step) => (
                    <div key={step.phase} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                      <div><p className="font-bold">{step.phase}</p><p className="text-xs text-slate-500">{step.timing}</p></div>
                      <strong className="text-amber-300">{formatEuro((step.amount / project.initialCapital) * capital)}</strong>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          )}

          {activeTab === "companies" && (
            <div className="space-y-6">
              <div><p className="text-sm font-bold uppercase tracking-[0.22em] text-amber-300">Motore Alpha</p><h1 className="mt-2 text-3xl font-black">Watchlist ad alto potenziale</h1><p className="mt-3 text-slate-400">Classifica iniziale da rivalutare con i dati autonomi, non un ordine di acquisto.</p></div>
              <div className="grid gap-4 xl:grid-cols-2">
                {companies.map((company, index) => (
                  <article key={company.ticker} className="panel p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div><p className="text-xs text-slate-500">#{index + 1} · {company.sector}</p><h2 className="mt-1 text-2xl font-black text-amber-300">{company.ticker}</h2><p className="text-sm text-slate-400">{company.name}</p></div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${badge(company.action)}`}>{company.action}</span>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-3 text-sm"><div className="rounded-xl bg-slate-950/60 p-3">Score<br/><strong>{company.score}/100</strong></div><div className="rounded-xl bg-slate-950/60 p-3">Rischio<br/><strong>{company.risk}/100</strong></div><div className="rounded-xl bg-slate-950/60 p-3">Peso massimo<br/><strong>{company.maxWeight}%</strong></div></div>
                    <p className="mt-5 text-sm leading-6 text-slate-300">{company.thesis}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-500"><strong className="text-slate-300">Verificare:</strong> {company.trigger}</p>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeTab === "portfolio" && (
            <div className="space-y-6">
              <div><p className="text-sm font-bold uppercase tracking-[0.22em] text-amber-300">Portafoglio candidato</p><h1 className="mt-2 text-3xl font-black">Allocazione con limiti di rischio</h1></div>
              {allocationTargets.map((item) => (
                <article key={item.id} className="panel grid gap-4 p-5 sm:grid-cols-[1fr_120px_160px] sm:items-center sm:p-6">
                  <div><h2 className="font-black">{item.label}</h2><p className="mt-1 text-sm text-slate-500">{item.role}</p></div><p className="text-2xl font-black text-amber-300">{item.weight}%</p><p className="font-black sm:text-right">{formatEuro((capital * item.weight) / 100)}</p>
                </article>
              ))}
              <article className="panel p-5 sm:p-6"><h2 className="text-xl font-black">Regole operative</h2><div className="mt-4 space-y-3">{decisionRules.map((rule) => <p key={rule} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-300">{rule}</p>)}</div></article>
            </div>
          )}

          {activeTab === "roadmap" && (
            <div className="space-y-6">
              <div><p className="text-sm font-bold uppercase tracking-[0.22em] text-amber-300">Misurazione</p><h1 className="mt-2 text-3xl font-black">Traguardi del progetto</h1><p className="mt-3 text-slate-400">Il percorso ambizioso verso 100.000 € richiede circa il 25,9% annuo. Il percorso base serve a misurare risultati realistici senza nascondere il rischio.</p></div>
              <div className="space-y-4">{milestones.map((item) => (
                <article key={item.year} className="panel grid gap-4 p-5 sm:grid-cols-[100px_1fr_1fr_2fr] sm:items-center sm:p-6"><p className="text-xl font-black">Anno {item.year}</p><p><span className="text-xs text-slate-500">Base</span><br/><strong>{formatEuro((item.baseTarget / project.initialCapital) * capital)}</strong></p><p><span className="text-xs text-slate-500">Ambizioso</span><br/><strong className="text-amber-300">{formatEuro((item.ambitiousTarget / project.initialCapital) * capital)}</strong></p><p className="text-sm leading-6 text-slate-400">{item.focus}</p></article>
              ))}</div>
            </div>
          )}

          {activeTab === "controls" && (
            <div className="space-y-6">
              <div><p className="text-sm font-bold uppercase tracking-[0.22em] text-amber-300">Controllo umano</p><h1 className="mt-2 text-3xl font-black">Impostazioni del progetto</h1></div>
              <article className="panel p-5 sm:p-6"><label htmlFor="capital" className="text-sm font-bold text-slate-300">Capitale di riferimento</label><div className="mt-3 flex gap-2"><input id="capital" type="number" min="1" value={capitalInput} onChange={(event) => setCapitalInput(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-amber-400"/><button onClick={saveCapital} className="rounded-xl bg-amber-400 px-5 py-3 font-black text-slate-950">Salva</button></div>{message && <p className="mt-4 text-sm font-bold text-emerald-300">{message}</p>}</article>
              <article className="panel border-rose-400/20 p-5 sm:p-6"><h2 className="text-xl font-black">Protezione obbligatoria</h2><p className="mt-3 leading-7 text-slate-300">Fenice non possiede credenziali di broker, non sposta denaro e non invia ordini. Ogni acquisto, vendita o modifica reale del portafoglio richiede una conferma esplicita.</p></article>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
