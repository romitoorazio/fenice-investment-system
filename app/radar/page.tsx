import Link from "next/link";
import snapshot from "@/data/latest-snapshot.json";
import type { AutonomySnapshot } from "@/lib/autonomy";
import { buildMissionControl } from "@/lib/mission";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function topCounts(items: string[]) {
  const counts = new Map<string, number>();
  for (const item of items.filter(Boolean)) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function money(value?: number, currency = "USD") {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency, maximumFractionDigits: 2 }).format(value as number);
  } catch {
    return `${value?.toFixed(2)} ${currency}`;
  }
}

export default function RadarPage() {
  const data = snapshot as AutonomySnapshot;
  const mission = buildMissionControl(data);
  const markets = data.markets.filter((item) => item.classification !== "stablecoin");
  const regions = topCounts(markets.map((item) => item.region ?? "Non classificata"));
  const sectors = topCounts(markets.map((item) => item.sector ?? item.assetClass));
  const themes = topCounts(markets.flatMap((item) => item.themes ?? []));
  const top = mission.rankedAssets.slice(0, 20);
  const ready = top.filter((item) => item.action === "ACCUMULA" && item.entryReadiness >= 70).length;

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-28 pt-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-cyan-400/20 bg-slate-900/80 p-6 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">Fenice Global Radar · Score 2.0</p>
              <h1 className="mt-2 text-3xl font-black">Il mercato intero, con timing e rischio separati dalla narrativa</h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
                Fenice confronta mercati, settori e asset diversi. La convinzione misura la qualità complessiva del candidato;
                la readiness misura invece quanto il momento attuale è favorevole a un ingresso. Nessun ranking equivale a un ordine automatico.
              </p>
            </div>
            <Link href="/" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/5">← Mission Control</Link>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-5">
          {[
            ["Strumenti osservati", markets.length],
            ["Regioni", regions.length],
            ["Settori", sectors.length],
            ["Qualità dati", `${mission.dataQuality}/100`],
            ["Pronti all'ingresso", ready],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
              <div className="mt-2 text-2xl font-black text-white">{value}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Breakdown title="Regioni" rows={regions.slice(0, 8)} />
          <Breakdown title="Settori" rows={sectors.slice(0, 8)} />
          <Breakdown title="Temi" rows={themes.slice(0, 8)} />
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Ranking globale</p>
              <h2 className="mt-1 text-2xl font-black">Top opportunità diversificate</h2>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <div className="rounded-xl bg-slate-950 px-3 py-2 text-slate-400">Regime: <strong className="text-white">{mission.regime}</strong></div>
              <div className="rounded-xl bg-slate-950 px-3 py-2 text-slate-400">Liquidità target: <strong className="text-white">{mission.cashTargetPercent}%</strong></div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-white/10">
                  <th className="px-3 py-3">Strumento</th>
                  <th className="px-3 py-3">Regione</th>
                  <th className="px-3 py-3">Settore</th>
                  <th className="px-3 py-3">Prezzo</th>
                  <th className="px-3 py-3">Fenice</th>
                  <th className="px-3 py-3">Readiness</th>
                  <th className="px-3 py-3">Conf.</th>
                  <th className="px-3 py-3">Rischio</th>
                  <th className="px-3 py-3">Segnale</th>
                </tr>
              </thead>
              <tbody>
                {top.map((asset) => (
                  <tr key={`${asset.symbol}-${asset.source}`} className="border-b border-white/5 align-top">
                    <td className="px-3 py-4">
                      <div className="font-black text-white">{asset.symbol}</div>
                      <div className="max-w-xs truncate text-xs text-slate-400">{asset.name}</div>
                      <div className="mt-1 max-w-sm text-[11px] leading-4 text-slate-500">{asset.reason}</div>
                    </td>
                    <td className="px-3 py-4 text-slate-300">{asset.region ?? "—"}</td>
                    <td className="px-3 py-4 text-slate-300">{asset.sector ?? asset.assetClass}</td>
                    <td className="px-3 py-4 text-slate-300">{money(asset.price, asset.currency)}</td>
                    <td className="px-3 py-4 font-black text-cyan-300">{asset.conviction}/100</td>
                    <td className="px-3 py-4">
                      <div className="font-black text-white">{asset.entryReadiness}/100</div>
                      <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${asset.entryReadiness}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-4"><Band value={asset.confidenceBand} /></td>
                    <td className="px-3 py-4"><RiskBand value={asset.riskBand} raw={asset.risk} /></td>
                    <td className="px-3 py-4"><Signal action={asset.action} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Come leggere Score 2.0</p>
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
              <p><strong className="text-white">Fenice:</strong> qualità complessiva del candidato nel regime corrente.</p>
              <p><strong className="text-white">Readiness:</strong> qualità del timing d'ingresso; penalizza anche rialzi troppo verticali.</p>
              <p><strong className="text-white">Confidenza:</strong> qualità e freschezza dei dati disponibili.</p>
              <p><strong className="text-white">Rischio:</strong> resta un freno autonomo: una grande opportunità non cancella un rischio estremo.</p>
            </div>
          </div>
          <div className="rounded-3xl border border-amber-400/20 bg-amber-400/5 p-5 text-sm leading-6 text-amber-100">
            <strong>Guardrail permanente:</strong> Fenice può cercare ovunque, ma non deve comprare ovunque. ACCUMULA significa candidato
            per un ingresso progressivo dopo verifica fondamentale, valutazione e catalizzatori. Nessun ordine viene inviato automaticamente.
          </div>
        </section>
      </div>
    </main>
  );
}

function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-300">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.map(([name, count]) => (
          <div key={name} className="flex items-center justify-between gap-3">
            <span className="truncate text-sm text-slate-300">{name}</span>
            <span className="rounded-lg bg-slate-950 px-2 py-1 text-xs font-black text-white">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Signal({ action }: { action: "ACCUMULA" | "MANTIENI" | "ATTENDI" | "EVITA" }) {
  const classes = action === "ACCUMULA"
    ? "bg-emerald-400/15 text-emerald-300"
    : action === "MANTIENI"
      ? "bg-cyan-400/15 text-cyan-300"
      : action === "ATTENDI"
        ? "bg-amber-400/15 text-amber-300"
        : "bg-rose-400/15 text-rose-300";
  return <span className={`rounded-lg px-2 py-1 text-xs font-black ${classes}`}>{action}</span>;
}

function Band({ value }: { value: "ALTA" | "MEDIA" | "BASSA" }) {
  const classes = value === "ALTA" ? "text-emerald-300" : value === "MEDIA" ? "text-amber-300" : "text-rose-300";
  return <span className={`text-xs font-black ${classes}`}>{value}</span>;
}

function RiskBand({ value, raw }: { value: "BASSO" | "MEDIO" | "ALTO" | "ESTREMO"; raw: number }) {
  const classes = value === "BASSO" ? "text-emerald-300" : value === "MEDIO" ? "text-amber-200" : "text-rose-300";
  return <div><div className={`text-xs font-black ${classes}`}>{value}</div><div className="mt-1 text-[11px] text-slate-500">{raw}/100</div></div>;
}
