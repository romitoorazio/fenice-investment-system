import Link from "next/link";
import registry from "@/data/europe-market-registry.json";
import coverage from "@/data/europe-market-coverage.json";
import instrumentUniverse from "@/data/europe-instrument-universe.json";

type Market = (typeof registry.markets)[number];
type InstrumentMarketCoverage = {
  marketId: string;
  instrumentCount: number;
  providerCovered: boolean;
};

const tierLabel = (tier: number) => {
  if (tier === 1) return "Core europeo";
  if (tier === 2) return "Mercati estesi";
  return "Frontier / specialistici";
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function EuropeCoveragePage() {
  const markets = [...registry.markets] as Market[];
  const byTier = [1, 2, 3].map((tier) => ({ tier, markets: markets.filter((market) => market.tier === tier) }));
  const instrumentRows = instrumentUniverse.marketCoverage as InstrumentMarketCoverage[];
  const instrumentCountByMarket = new Map(instrumentRows.map((row) => [row.marketId, row]));
  const instrumentCount = Number(instrumentUniverse.coverage.instrumentCount || 0);
  const providerMatchedMarkets = Number(instrumentUniverse.coverage.providerMatchedMarkets || 0);
  const providerMatchedMarketPercent = Number(instrumentUniverse.coverage.providerMatchedMarketPercent || 0);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Fenice V7 Europe</p>
            <h1 className="mt-2 text-3xl font-black">Copertura mercati europei</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Registro paneuropeo per identità, ricerca e routing dei dati. Un mercato registrato non implica feed realtime o abilitazione all&apos;esecuzione.
            </p>
          </div>
          <Link href="/" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-cyan-300 hover:bg-white/5">← Fenice</Link>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Mercati attivi", coverage.activePrimaryMarkets],
            ["Paesi coperti", coverage.coveredCountries],
            ["Valute", coverage.coveredCurrencies],
            ["Euronext", `${coverage.groupCoverage.euronext.covered}/${coverage.groupCoverage.euronext.required}`],
            ["Nasdaq Europe", `${coverage.groupCoverage.nasdaqEurope.covered}/${coverage.groupCoverage.nasdaqEurope.required}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</div>
              <div className="mt-2 text-2xl font-black">{value}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Strumenti provider</div>
            <div className="mt-2 text-2xl font-black">{instrumentCount.toLocaleString("it-IT")}</div>
            <div className="mt-1 text-xs text-slate-500">catalogo Twelve Data V7, sola ricerca</div>
          </div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Mercati con strumenti</div>
            <div className="mt-2 text-2xl font-black">{providerMatchedMarkets}/{coverage.activePrimaryMarkets}</div>
            <div className="mt-1 text-xs text-slate-500">{providerMatchedMarketPercent}% del registro attivo</div>
          </div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Stato catalogo</div>
            <div className="mt-2 text-lg font-black">{instrumentUniverse.status}</div>
            <div className="mt-1 text-xs text-slate-500">aggiornamento: {instrumentUniverse.generatedAt || "in attesa del primo refresh"}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-emerald-300 px-3 py-1 text-xs font-black text-slate-950">{coverage.status}</span>
            <span className="text-sm text-slate-300">
              LIVE: <strong className="text-rose-300">OFF</strong> · PAPER Europa: <strong className="text-rose-300">OFF</strong> · realtime universale: <strong className="text-amber-300">feed/licenze richiesti</strong>
            </span>
          </div>
        </section>

        {byTier.map(({ tier, markets: tierMarkets }) => (
          <section key={tier} className="space-y-3">
            <div>
              <h2 className="text-xl font-black">{tierLabel(tier)}</h2>
              <p className="text-sm text-slate-500">{tierMarkets.length} mercati</p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="bg-slate-900">
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Paese</th><th className="px-4 py-3">Mercato</th><th className="px-4 py-3">MIC</th><th className="px-4 py-3">Valuta</th><th className="px-4 py-3">Strumenti</th><th className="px-4 py-3">Benchmark</th><th className="px-4 py-3">Fonte</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-slate-950/70">
                  {tierMarkets.map((market) => {
                    const providerCoverage = instrumentCountByMarket.get(market.id);
                    return (
                      <tr key={market.id}>
                        <td className="px-4 py-3 font-bold">{market.name}</td>
                        <td className="px-4 py-3 text-slate-300">{market.venue}</td>
                        <td className="px-4 py-3 font-mono text-cyan-300">{market.mic}</td>
                        <td className="px-4 py-3">{market.currency}</td>
                        <td className="px-4 py-3">
                          {providerCoverage?.providerCovered
                            ? <span className="font-bold text-emerald-300">{providerCoverage.instrumentCount.toLocaleString("it-IT")}</span>
                            : <span className="text-amber-300">fonte ufficiale / gap</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{market.benchmarks.join(", ") || "n/d"}</td>
                        <td className="px-4 py-3 text-slate-400">{market.source}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5">
            <h2 className="font-black text-amber-200">Mercati limitati per compliance</h2>
            <div className="mt-3 space-y-3 text-sm">
              {registry.restrictedMarkets.map((market) => (
                <div key={market.country}><strong>{market.countryName}</strong> · {market.venue} · {market.primaryMic}<div className="text-slate-400">{market.reason}</div></div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <h2 className="font-black">Giurisdizioni senza borsa equity domestica</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-400">
              {registry.jurisdictionsWithoutDomesticPrimaryEquityExchange.map((item) => (
                <div key={item.country}><strong className="text-slate-200">{item.countryName}</strong> — {item.researchRouting}</div>
              ))}
            </div>
          </div>
        </section>

        <p className="pb-24 text-xs leading-5 text-slate-500">
          Fenice separa copertura di ricerca ed esecuzione. Il catalogo provider misura soltanto gli strumenti realmente enumerati dalla fonte di riferimento. I mercati senza strumenti vengono esposti come gap invece di essere dichiarati coperti. Prezzi realtime e order routing vengono abilitati solo con feed autorizzati e certificazione specifica; questa espansione non può aggirare i lock PAPER/LIVE della V6.
        </p>
      </div>
    </main>
  );
}
