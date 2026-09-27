import Link from "next/link";
import coverageReport from "@/data/global-reference-coverage.json";

type RegionCoverage = {
  regionId: string;
  regionName: string;
  targetCountries: number;
  providerMatchedCountries: number;
  instrumentCount: number;
  providerMatchedCountryPercent: number;
};

type CountryCoverage = {
  code: string;
  name: string;
  regionId: string;
  regionName: string;
  providerCovered: boolean;
  instrumentCount: number;
  providerExchangeCount: number;
  currencies: string[];
  executionEligible: boolean;
};

const report = coverageReport as {
  generatedAt: string;
  status: string;
  provider: {
    id: string;
    globalStockRecords: number;
    matchedInstrumentReferences: number;
    note: string;
  };
  coverage: {
    targetCountries: number;
    providerMatchedCountries: number;
    providerMatchedCountryPercent: number;
    matchedInstrumentReferences: number;
  };
  regionCoverage: RegionCoverage[];
  countryCoverage: CountryCoverage[];
  safety: {
    researchOnly: boolean;
    paperExecutionAllowed: boolean;
    liveTradingAllowed: boolean;
    brokerConnectivityAllowed: boolean;
    isolatedFromPaperV6InstrumentMaster: boolean;
    changesPaperV6Fingerprint: boolean;
    note: string;
  };
};

const formatNumber = (value: number) => value.toLocaleString("it-IT");

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function GlobalCoveragePage() {
  const coveredCountries = report.countryCoverage
    .filter((country) => country.providerCovered)
    .sort((a, b) => b.instrumentCount - a.instrumentCount || a.name.localeCompare(b.name));
  const uncoveredCountries = report.countryCoverage
    .filter((country) => !country.providerCovered)
    .sort((a, b) => a.name.localeCompare(b.name));
  const executionEligibleCountries = report.countryCoverage.filter((country) => country.executionEligible).length;
  const locksValid = report.safety.researchOnly
    && !report.safety.paperExecutionAllowed
    && !report.safety.liveTradingAllowed
    && !report.safety.brokerConnectivityAllowed
    && report.safety.isolatedFromPaperV6InstrumentMaster
    && !report.safety.changesPaperV6Fingerprint
    && executionEligibleCountries === 0;

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-28 pt-6 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Fenice V7 Global</p>
            <h1 className="mt-2 text-3xl font-black">Copertura mondiale verificata</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Evidenza reale del catalogo Twelve Data. La presenza di un Paese o di uno strumento prova soltanto la disponibilità di riferimento: non abilita prezzi realtime, PAPER o ordini.
            </p>
          </div>
          <Link href="/" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-cyan-300 hover:bg-white/5">← Fenice</Link>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Paesi target", formatNumber(report.coverage.targetCountries)],
            ["Paesi con riferimenti", `${report.coverage.providerMatchedCountries}/${report.coverage.targetCountries}`],
            ["Copertura Paesi", `${report.coverage.providerMatchedCountryPercent}%`],
            ["Riferimenti strumenti", formatNumber(report.coverage.matchedInstrumentReferences)],
          ].map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-black text-white sm:text-3xl">{value}</p>
            </article>
          ))}
        </section>

        <section className={`rounded-2xl border p-5 ${locksValid ? "border-emerald-400/25 bg-emerald-400/[0.06]" : "border-rose-400/30 bg-rose-400/[0.08]"}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={`text-xs font-black uppercase tracking-[0.2em] ${locksValid ? "text-emerald-300" : "text-rose-300"}`}>Gate derivato dall&apos;evidence</p>
              <h2 className="mt-2 text-xl font-black">{locksValid ? "Ricerca globale isolata e fail-closed" : "Blocco di sicurezza non valido"}</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${locksValid ? "bg-emerald-300 text-slate-950" : "bg-rose-300 text-slate-950"}`}>{locksValid ? "LOCK OK" : "LOCK FAIL"}</span>
          </div>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-xl bg-black/20 p-3">LIVE <strong className="float-right text-rose-300">{report.safety.liveTradingAllowed ? "ON" : "OFF"}</strong></div>
            <div className="rounded-xl bg-black/20 p-3">PAPER globale <strong className="float-right text-rose-300">{report.safety.paperExecutionAllowed ? "ON" : "OFF"}</strong></div>
            <div className="rounded-xl bg-black/20 p-3">Broker <strong className="float-right text-rose-300">{report.safety.brokerConnectivityAllowed ? "ON" : "OFF"}</strong></div>
            <div className="rounded-xl bg-black/20 p-3">Paesi eseguibili <strong className="float-right text-rose-300">{executionEligibleCountries}</strong></div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-400">{report.safety.note}</p>
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-xl font-black">Copertura misurata per regione</h2>
            <p className="mt-1 text-xs text-slate-500">Conteggi calcolati dal report provider persistito, non da descrizioni manuali.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {report.regionCoverage.map((region) => (
              <article key={region.regionId} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-black">{region.regionName}</h3><p className="mt-1 text-xs text-slate-500">{region.providerMatchedCountries}/{region.targetCountries} Paesi</p></div>
                  <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-300">{region.providerMatchedCountryPercent}%</span>
                </div>
                <p className="mt-4 text-2xl font-black">{formatNumber(region.instrumentCount)}</p>
                <p className="text-xs text-slate-500">riferimenti strumenti</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="border-b border-white/10 bg-slate-900 p-4">
              <h2 className="font-black">Paesi con riferimenti provider</h2>
              <p className="mt-1 text-xs text-slate-500">{coveredCountries.length} Paesi, ordinati per numero di riferimenti.</p>
            </div>
            <div className="max-h-[36rem] overflow-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="sticky top-0 bg-slate-950 text-left text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Paese</th><th className="px-4 py-3">Regione</th><th className="px-4 py-3 text-right">Riferimenti</th><th className="px-4 py-3 text-right">Exchange</th></tr></thead>
                <tbody className="divide-y divide-white/5">
                  {coveredCountries.map((country) => (
                    <tr key={country.code}><td className="px-4 py-3 font-bold">{country.name} <span className="text-xs text-slate-600">{country.code}</span></td><td className="px-4 py-3 text-slate-400">{country.regionName}</td><td className="px-4 py-3 text-right font-black text-emerald-300">{formatNumber(country.instrumentCount)}</td><td className="px-4 py-3 text-right text-slate-400">{country.providerExchangeCount}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-5">
            <h2 className="font-black text-amber-200">Gap dichiarati</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{uncoveredCountries.length} Paesi target non hanno riferimenti nel catalogo corrente. Fenice li mostra come gap e non inventa copertura.</p>
            <div className="mt-4 flex max-h-[30rem] flex-wrap content-start gap-2 overflow-auto">
              {uncoveredCountries.map((country) => <span key={country.code} className="rounded-full border border-amber-300/15 bg-black/20 px-3 py-1.5 text-xs text-slate-300">{country.name} · {country.code}</span>)}
            </div>
          </div>
        </section>

        <footer className="space-y-1 pb-4 text-center text-xs text-slate-500">
          <p>Stato report: {report.status} · provider: {report.provider.id} · record provider: {formatNumber(report.provider.globalStockRecords)}</p>
          <p>Aggiornato {new Date(report.generatedAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</p>
        </footer>
      </div>
    </main>
  );
}
