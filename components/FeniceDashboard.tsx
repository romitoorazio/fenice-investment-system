"use client";

import { useEffect, useMemo, useState } from "react";
import {
  alerts,
  companies,
  formatEuro,
  indicators,
  portfolioTargets,
  project,
  reports,
  type Company,
  type TabId,
} from "../lib/fenice";

const tabs: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "overview", label: "Dashboard", icon: "◫" },
  { id: "companies", label: "Aziende", icon: "◎" },
  { id: "portfolio", label: "Portafoglio", icon: "◒" },
  { id: "reports", label: "Report", icon: "▤" },
  { id: "controls", label: "Controllo", icon: "✓" },
];

function StatCard({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article className={`panel p-5 ${accent ? "ring-1 ring-amber-400/35" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-3 text-2xl font-black ${accent ? "text-amber-300" : "text-white"}`}>{value}</p>
      <p className="mt-2 text-sm leading-5 text-slate-400">{detail}</p>
    </article>
  );
}

function ScoreBar({ value, compact = false }: { value: number; compact?: boolean }) {
  const tone = value >= 80 ? "bg-emerald-400" : value >= 65 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className={`overflow-hidden rounded-full bg-slate-800 ${compact ? "h-1.5" : "h-2"}`}>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "amber" | "green" | "red" | "slate" | "blue" }) {
  const tones = {
    amber: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    red: "border-rose-400/25 bg-rose-400/10 text-rose-300",
    slate: "border-slate-700 bg-slate-800/70 text-slate-300",
    blue: "border-sky-400/25 bg-sky-400/10 text-sky-300",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

function CompanyRow({ company }: { company: Company }) {
  const actionTone = company.action === "CANDIDATA" ? "green" : company.action === "ATTENDI" ? "amber" : "slate";
  return (
    <tr className="border-b border-slate-800/80 last:border-0">
      <td className="py-4 pr-4">
        <div className="font-black text-amber-300">{company.ticker}</div>
        <div className="mt-1 text-xs text-slate-500">{company.sector}</div>
      </td>
      <td className="min-w-56 py-4 pr-4">
        <div className="font-semibold text-white">{company.name}</div>
        <div className="mt-1 max-w-md text-sm text-slate-400">{company.thesis}</div>
      </td>
      <td className="min-w-32 py-4 pr-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-slate-400">Punteggio</span>
          <strong>{company.score}/100</strong>
        </div>
        <ScoreBar value={company.score} compact />
      </td>
      <td className="py-4 pr-4 text-sm">
        <span className={company.risk >= 70 ? "font-bold text-rose-300" : "text-slate-300"}>{company.risk}/100</span>
      </td>
      <td className="py-4 text-right">
        <Badge tone={actionTone}>{company.action}</Badge>
      </td>
    </tr>
  );
}

export default function FeniceDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [capital, setCapital] = useState(project.initialCapital);
  const [capitalInput, setCapitalInput] = useState(String(project.initialCapital));
  const [decisionLog, setDecisionLog] = useState<string[]>([]);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    const storedCapital = window.localStorage.getItem("fenice-capital");
    const storedLog = window.localStorage.getItem("fenice-decisions");
    if (storedCapital) {
      const parsed = Number(storedCapital);
      if (Number.isFinite(parsed) && parsed > 0) {
        setCapital(parsed);
        setCapitalInput(String(parsed));
      }
    }
    if (storedLog) {
      try {
        setDecisionLog(JSON.parse(storedLog));
      } catch {
        setDecisionLog([]);
      }
    }
  }, []);

  const companyByTicker = useMemo(() => new Map(companies.map((company) => [company.ticker, company])), []);

  function saveCapital() {
    const parsed = Number(capitalInput.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSavedMessage("Inserisci un capitale valido.");
      return;
    }
    setCapital(parsed);
    window.localStorage.setItem("fenice-capital", String(parsed));
    setSavedMessage("Capitale salvato su questo dispositivo.");
  }

  function recordDecision() {
    const entry = `${new Date().toLocaleString("it-IT")} — Confermato verdetto: ${project.verdict}`;
    const next = [entry, ...decisionLog].slice(0, 8);
    setDecisionLog(next);
    window.localStorage.setItem("fenice-decisions", JSON.stringify(next));
    setSavedMessage("Decisione registrata. Nessun ordine è stato eseguito.");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-xl font-black text-slate-950 shadow-lg shadow-amber-500/15">F</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black sm:text-base">{project.name}</p>
              <p className="truncate text-xs text-slate-500">{project.goal} · Orazio</p>
            </div>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <Badge tone="green">Sistema operativo</Badge>
            <span className="text-xs text-slate-500">Dati dimostrativi · {project.updatedAt}</span>
          </div>
        </div>
      </header>

      <div className="relative mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:py-8">
        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <nav className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
                  activeTab === tab.id
                    ? "bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/10"
                    : "border border-slate-800 bg-slate-900/70 text-slate-400 hover:border-slate-700 hover:text-white"
                }`}
              >
                <span aria-hidden>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="panel mt-5 hidden p-4 lg:block">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Regola fondamentale</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">Il software analizza e propone. <strong className="text-white">Orazio decide.</strong></p>
          </div>
        </aside>

        <section className="min-w-0">
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.22em] text-amber-300">Quadro operativo</p>
                  <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">La situazione in una schermata</h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">Monitoraggio strutturato di geopolitica, macroeconomia, mercati, AI, biotech e agritech con orizzonte di {project.horizonYears} anni.</p>
                </div>
                <Badge tone="amber">Verdetto da confermare</Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Verdetto operativo" value={project.verdict} detail="La liquidità resta protetta." accent />
                <StatCard label="Indice opportunità" value={`${project.opportunity}/100`} detail="Potenziale interessante nel lungo periodo." />
                <StatCard label="Indice rischio" value={`${project.risk}/100`} detail="Ancora superiore alla soglia ideale." />
                <StatCard label="Capitale disponibile" value={formatEuro(capital)} detail="Nessun acquisto eseguito dal sistema." />
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
                <article className="panel p-5 sm:p-6">
                  <div className="mb-6 flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-black">Scenario mondiale</h2>
                      <p className="mt-1 text-sm text-slate-500">Sei aree che alimentano il verdetto Fenice.</p>
                    </div>
                    <Badge tone="blue">Fiducia {project.confidence}/100</Badge>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    {indicators.map((indicator) => (
                      <div key={indicator.label} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-bold text-slate-200">{indicator.label}</p>
                            <p className="mt-1 text-xs text-slate-500">{indicator.note}</p>
                          </div>
                          <div className="text-right">
                            <strong className="text-lg">{indicator.value}</strong>
                            <span className="text-xs text-slate-500">/100</span>
                          </div>
                        </div>
                        <ScoreBar value={indicator.value} />
                      </div>
                    ))}
                  </div>
                </article>

                <article className="panel p-5 sm:p-6">
                  <h2 className="text-xl font-black">Avvisi prioritari</h2>
                  <div className="mt-5 space-y-3">
                    {alerts.map((alert) => (
                      <div key={alert.title} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                        <div className="mb-2">
                          <Badge tone={alert.level === "alta" ? "red" : alert.level === "media" ? "amber" : "blue"}>{alert.level.toUpperCase()}</Badge>
                        </div>
                        <p className="font-bold text-slate-200">{alert.title}</p>
                        <p className="mt-1 text-sm leading-5 text-slate-500">{alert.detail}</p>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <article className="panel overflow-hidden">
                <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-5 sm:px-6">
                  <div>
                    <h2 className="text-xl font-black">Top 5 aziende</h2>
                    <p className="mt-1 text-sm text-slate-500">Classifica provvisoria della watchlist.</p>
                  </div>
                  <button onClick={() => setActiveTab("companies")} className="text-sm font-bold text-amber-300 hover:text-amber-200">Vedi analisi →</button>
                </div>
                <div className="overflow-x-auto px-5 sm:px-6">
                  <table className="w-full min-w-[760px] text-left">
                    <thead className="text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="py-4 pr-4">Ticker</th>
                        <th className="py-4 pr-4">Azienda e tesi</th>
                        <th className="py-4 pr-4">Qualità</th>
                        <th className="py-4 pr-4">Rischio</th>
                        <th className="py-4 text-right">Stato</th>
                      </tr>
                    </thead>
                    <tbody>{companies.map((company) => <CompanyRow key={company.ticker} company={company} />)}</tbody>
                  </table>
                </div>
              </article>
            </div>
          )}

          {activeTab === "companies" && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-amber-300">Motore aziende</p>
                <h1 className="mt-2 text-3xl font-black">Classifica e motivazioni</h1>
                <p className="mt-3 text-slate-400">Il punteggio non basta: per ogni società contano tesi, rischio e prossimo evento da verificare.</p>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {companies.map((company, index) => (
                  <article key={company.ticker} className="panel p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 font-black text-amber-300">{index + 1}</div>
                        <div>
                          <p className="text-xl font-black">{company.ticker}</p>
                          <p className="text-sm text-slate-500">{company.name}</p>
                        </div>
                      </div>
                      <Badge tone={company.action === "CANDIDATA" ? "green" : company.action === "ATTENDI" ? "amber" : "slate"}>{company.action}</Badge>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-3">
                      <div className="rounded-xl bg-slate-950/60 p-3"><p className="text-xs text-slate-500">Score</p><p className="mt-1 font-black">{company.score}/100</p></div>
                      <div className="rounded-xl bg-slate-950/60 p-3"><p className="text-xs text-slate-500">Rischio</p><p className="mt-1 font-black">{company.risk}/100</p></div>
                      <div className="rounded-xl bg-slate-950/60 p-3"><p className="text-xs text-slate-500">Potenziale</p><p className="mt-1 text-sm font-black">{company.potential}</p></div>
                    </div>
                    <div className="mt-5"><ScoreBar value={company.score} /></div>
                    <div className="mt-5 space-y-4 text-sm leading-6">
                      <div><p className="font-bold text-slate-300">Tesi</p><p className="text-slate-500">{company.thesis}</p></div>
                      <div><p className="font-bold text-slate-300">Segnale da aspettare</p><p className="text-slate-500">{company.trigger}</p></div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeTab === "portfolio" && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-amber-300">Piano capitale</p>
                <h1 className="mt-2 text-3xl font-black">Portafoglio candidato, non eseguito</h1>
                <p className="mt-3 max-w-3xl text-slate-400">Le percentuali mostrano una possibile ripartizione futura. Con verdetto ATTENDERE, il capitale reale rimane liquido.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Capitale reale" value={formatEuro(capital)} detail="Disponibile e non investito." />
                <StatCard label="Investito dal software" value={formatEuro(0)} detail="Il sistema non può eseguire ordini." />
                <StatCard label="Liquidità" value="100%" detail="Coerente con il verdetto attuale." accent />
              </div>

              <article className="panel overflow-hidden">
                <div className="border-b border-slate-800 p-5 sm:p-6">
                  <h2 className="text-xl font-black">Allocazione obiettivo</h2>
                  <p className="mt-1 text-sm text-slate-500">Simulazione sul capitale impostato.</p>
                </div>
                <div className="divide-y divide-slate-800">
                  {portfolioTargets.map((target) => {
                    const company = companyByTicker.get(target.ticker);
                    return (
                      <div key={target.ticker} className="grid gap-3 p-5 sm:grid-cols-[1fr_110px_140px] sm:items-center sm:px-6">
                        <div>
                          <div className="flex items-center gap-2"><strong className="text-amber-300">{target.ticker}</strong><span className="text-sm text-slate-300">{company?.name}</span></div>
                          <p className="mt-1 text-xs text-slate-500">{target.role}</p>
                        </div>
                        <div className="text-sm"><span className="text-slate-500">Peso </span><strong>{target.weight}%</strong></div>
                        <div className="text-left font-black sm:text-right">{formatEuro((capital * target.weight) / 100)}</div>
                      </div>
                    );
                  })}
                </div>
              </article>
            </div>
          )}

          {activeTab === "reports" && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-amber-300">Memoria del sistema</p>
                <h1 className="mt-2 text-3xl font-black">Storico dei report</h1>
                <p className="mt-3 text-slate-400">Ogni analisi deve lasciare una traccia confrontabile, evitando decisioni emotive.</p>
              </div>
              <div className="space-y-4">
                {reports.map((report) => (
                  <article key={report.date} className="panel p-5 sm:p-6">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div>
                        <p className="text-sm font-bold text-slate-500">{report.date}</p>
                        <h2 className="mt-2 text-2xl font-black text-amber-300">{report.verdict}</h2>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone="green">Opportunità {report.opportunity}</Badge>
                        <Badge tone="red">Rischio {report.risk}</Badge>
                        <Badge tone="blue">Fiducia {report.confidence}</Badge>
                      </div>
                    </div>
                    <p className="mt-5 max-w-4xl leading-7 text-slate-300">{report.summary}</p>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeTab === "controls" && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-amber-300">Sicurezza decisionale</p>
                <h1 className="mt-2 text-3xl font-black">Controllo umano obbligatorio</h1>
                <p className="mt-3 max-w-3xl text-slate-400">Il sistema prepara l'analisi, ma non compra, non vende e non sposta denaro senza una decisione esplicita.</p>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <article className="panel p-5 sm:p-6">
                  <h2 className="text-xl font-black">Impostazioni progetto</h2>
                  <label className="mt-5 block text-sm font-bold text-slate-300" htmlFor="capital">Capitale di riferimento</label>
                  <div className="mt-2 flex gap-2">
                    <input id="capital" type="number" min="1" value={capitalInput} onChange={(event) => setCapitalInput(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-amber-400" />
                    <button onClick={saveCapital} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950 hover:bg-slate-200">Salva</button>
                  </div>
                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">
                    <p><strong className="text-white">Orizzonte:</strong> {project.horizonYears} anni</p>
                    <p className="mt-2"><strong className="text-white">Obiettivo:</strong> trasformare il capitale con disciplina, non con scommesse casuali.</p>
                  </div>
                </article>

                <article className="panel p-5 sm:p-6">
                  <h2 className="text-xl font-black">Conferma del verdetto</h2>
                  <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5">
                    <p className="text-sm font-bold uppercase tracking-wider text-amber-300">Proposta del sistema</p>
                    <p className="mt-2 text-3xl font-black">{project.verdict}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-300">Registrare il verdetto significa accettare l'analisi. Non viene inviato alcun ordine al mercato.</p>
                  </div>
                  <button onClick={recordDecision} className="mt-4 w-full rounded-xl bg-amber-400 px-5 py-3 font-black text-slate-950 transition hover:bg-amber-300">Registra verdetto ATTENDERE</button>
                </article>
              </div>

              {savedMessage && <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-300">{savedMessage}</div>}

              <article className="panel p-5 sm:p-6">
                <h2 className="text-xl font-black">Registro decisioni locale</h2>
                <p className="mt-1 text-sm text-slate-500">Salvato nel browser di questo dispositivo.</p>
                <div className="mt-5 space-y-2">
                  {decisionLog.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">Nessuna decisione ancora registrata.</p>
                  ) : (
                    decisionLog.map((entry) => <p key={entry} className="rounded-xl bg-slate-950/60 p-4 text-sm text-slate-300">{entry}</p>)
                  )}
                </div>
              </article>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
