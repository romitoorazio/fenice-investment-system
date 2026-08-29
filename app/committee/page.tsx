import Link from "next/link";
import report from "@/data/investment-committee.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Decision = {
  rank: number;
  symbol: string;
  name: string;
  sector: string;
  positionType: string;
  currentPrice: number | null;
  currency: string | null;
  decision: "COMPRA" | "OSSERVA" | "ATTENDI" | "EVITA";
  committeeScore: number;
  confidence: number;
  riskScore: number;
  maxWeightPercent: number;
  scorecard: Record<string, number>;
  valuation: {
    status: string;
    fairValueLow: number | null;
    fairValueBase: number | null;
    fairValueHigh: number | null;
    upsideBasePercent: number | null;
  };
  entryPlan: {
    orderMode: string;
    maxEntryPrice: number | null;
    firstTranchePercent: number;
    firstTrancheEuro: number;
  };
  bullCase: string[];
  bearCase: string[];
  invalidation: string[];
};

type CommitteeReport = {
  generatedAt: string | null;
  capitalEuro: number;
  marketRegime: string;
  dataQuality: number;
  sourceGate: string;
  executionGate: string;
  buyCandidateCount: number;
  proposedFirstTrancheEuro: number;
  goal: { targetEuro: number; horizonYears: number; requiredCagrPercent: number; warning: string };
  topDecisions: Decision[];
  warnings: string[];
};

const data = report as CommitteeReport;

function money(value: number | null | undefined, currency = "EUR") {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency, maximumFractionDigits: 2 }).format(value as number);
  } catch {
    return `${Number(value).toFixed(2)} ${currency}`;
  }
}

function badge(decision: Decision["decision"]) {
  if (decision === "COMPRA") return "bg-emerald-400/15 text-emerald-300 border-emerald-400/30";
  if (decision === "OSSERVA") return "bg-cyan-400/15 text-cyan-300 border-cyan-400/30";
  if (decision === "ATTENDI") return "bg-amber-400/15 text-amber-300 border-amber-400/30";
  return "bg-rose-400/15 text-rose-300 border-rose-400/30";
}

function gateClass(gate: string) {
  if (gate === "PRONTO_CON_CONFERMA") return "text-emerald-300";
  if (gate === "ATTENDERE") return "text-amber-300";
  return "text-rose-300";
}

export default function CommitteePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-28 pt-6 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-3xl border border-violet-400/20 bg-slate-900/85 p-6 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-300">Fenice Investment Committee</p>
              <h1 className="mt-2 text-3xl font-black">Decisioni, non classifiche</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Il Comitato combina fondamentali, valutazione, tecnica, rischio, catalizzatori e qualità dati. Un BUY richiede
                convergenza: nessun singolo indicatore può autorizzare capitale reale.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/radar" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:bg-white/5">Radar</Link>
              <Link href="/" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:bg-white/5">Mission Control</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <Metric label="Gate operativo" value={data.executionGate.replaceAll("_", " ")} className={gateClass(data.executionGate)} />
          <Metric label="Qualità dati" value={`${data.dataQuality}/100`} />
          <Metric label="BUY verificati" value={String(data.buyCandidateCount)} />
          <Metric label="Prima tranche" value={money(data.proposedFirstTrancheEuro)} />
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Missione</p>
              <h2 className="mt-1 text-xl font-black">€10.000 → €100.000 / 10 anni</h2>
            </div>
            <div className="rounded-xl bg-slate-950 px-4 py-2 text-sm">
              CAGR richiesto <strong className="text-violet-300">{data.goal.requiredCagrPercent}%</strong>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-400">{data.goal.warning}</p>
        </section>

        <section className="space-y-4">
          {data.topDecisions.length === 0 ? (
            <div className="rounded-3xl border border-amber-400/20 bg-amber-400/5 p-6 text-amber-100">
              Il primo ciclo Investment Committee non è ancora stato pubblicato. Il gate resta bloccato fino alla generazione dei dati.
            </div>
          ) : data.topDecisions.map((item) => (
            <article key={item.symbol} className="rounded-3xl border border-white/10 bg-slate-900/85 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-500">#{item.rank}</span>
                    <h3 className="text-2xl font-black">{item.symbol}</h3>
                    <span className={`rounded-lg border px-2 py-1 text-xs font-black ${badge(item.decision)}`}>{item.decision}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.sector} · {item.positionType}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Fenice Committee Score</div>
                  <div className="text-3xl font-black text-violet-300">{item.committeeScore}</div>
                </div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-4">
                <Mini label="Prezzo" value={money(item.currentPrice, item.currency || "USD")} />
                <Mini label="Confidenza" value={`${item.confidence}/100`} />
                <Mini label="Rischio" value={`${item.riskScore}/100`} />
                <Mini label="Peso max" value={`${item.maxWeightPercent}%`} />
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <Panel title="Valutazione">
                  <Row label="Bear" value={money(item.valuation.fairValueLow, item.currency || "USD")} />
                  <Row label="Base" value={money(item.valuation.fairValueBase, item.currency || "USD")} />
                  <Row label="Bull" value={money(item.valuation.fairValueHigh, item.currency || "USD")} />
                  <Row label="Upside base" value={Number.isFinite(item.valuation.upsideBasePercent) ? `${item.valuation.upsideBasePercent}%` : "—"} />
                </Panel>
                <Panel title="Piano ingresso">
                  <Row label="Ordine" value={item.entryPlan.orderMode} />
                  <Row label="Prezzo max" value={money(item.entryPlan.maxEntryPrice, item.currency || "USD")} />
                  <Row label="Prima tranche" value={money(item.entryPlan.firstTrancheEuro)} />
                  <Row label="Quota capitale" value={`${item.entryPlan.firstTranchePercent}%`} />
                </Panel>
                <Panel title="Scorecard">
                  {Object.entries(item.scorecard).map(([key, value]) => <Row key={key} label={key} value={`${value}/100`} />)}
                </Panel>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <TextList title="Perché può funzionare" items={item.bullCase} />
                <TextList title="Perché potremmo sbagliare" items={item.bearCase} />
              </div>

              <details className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <summary className="cursor-pointer text-sm font-black text-slate-300">Condizioni che invalidano la tesi</summary>
                <ul className="mt-3 space-y-2 text-sm text-slate-400">
                  {item.invalidation.map((text) => <li key={text}>• {text}</li>)}
                </ul>
              </details>
            </article>
          ))}
        </section>

        {data.warnings.length > 0 && (
          <section className="rounded-3xl border border-amber-400/20 bg-amber-400/5 p-5">
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-amber-300">Warning desk</h2>
            <ul className="mt-3 space-y-2 text-sm text-amber-100/80">
              {data.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, className = "text-white" }: { label: string; value: string; className?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-900 p-4"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div><div className={`mt-2 text-xl font-black ${className}`}>{value}</div></div>;
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-950/70 p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-sm font-black text-slate-200">{value}</div></div>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4"><h4 className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-slate-400">{title}</h4><div className="space-y-2">{children}</div></div>;
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 text-sm"><span className="capitalize text-slate-500">{label}</span><strong className="text-right text-slate-200">{value}</strong></div>;
}
function TextList({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4"><h4 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{title}</h4><ul className="mt-3 space-y-2 text-sm leading-5 text-slate-300">{items.length ? items.map((text) => <li key={text}>• {text}</li>) : <li>• Nessuna evidenza sufficiente.</li>}</ul></div>;
}
