import Link from "next/link";
import coverageReport from "@/data/global-reference-coverage.json";
import globalUniverse from "@/data/global-market-universe.json";
import worldEquityFunnel from "@/data/world-equity-funnel-status.json";
import { buildGlobalResearchDesk } from "@/lib/ui/global-research-desk";

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

// Server-only time source; avoids impure clock access inside the component render.
function serverRequestTime() {
  return Date.now();
}

export default function GlobalCoveragePage() {
  const desk = buildGlobalResearchDesk(globalUniverse, coverageReport, serverRequestTime());
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
          <div className="flex flex-wrap gap-2"><Link href="/opportunita-mondo" className="rounded-xl border border-cyan-300/30 px-4 py-2 text-sm font-bold text-cyan-300 hover:bg-white/5">Opportunità · verifica dati →</Link>
          <Link href="/" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-cyan-300 hover:bg-white/5">← Fenice</Link>
          <Link href="/paper-mondo" className="rounded-xl border border-amber-300/40 px-4 py-2 text-sm font-bold text-amber-200">PAPER mondiale V7 →</Link>
          </div>
        </header>

        <section className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.04] p-5" aria-label="Ricerca mondiale per sessione">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-cyan-300">Fenice World Research Desk</p>
              <h2 className="mt-2 text-xl font-black">Asia · Europa · Americhe · Africa</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Orari e finestre per organizzare la ricerca durante tutta la giornata; non sono prezzi, segnali di acquisto
                né prove che la borsa sia davvero aperta. Festività, sospensioni e accesso ai mercati richiedono conferma.
              </p>
            </div>
            <Link className="rounded-lg border border-cyan-300/30 px-3 py-2 text-xs font-bold text-cyan-200" href="/api/market/global-desk">
              API diagnostica
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-black/30 p-3"><p className="text-xs text-slate-400">Finestre indicative adesso</p><p className="mt-1 text-2xl font-black">{desk.summary.indicativeResearchWindowsNow}/{desk.summary.curatedVenues}</p></div>
            <div className="rounded-xl bg-black/30 p-3"><p className="text-xs text-slate-400">Regioni coordinate</p><p className="mt-1 text-2xl font-black">{desk.summary.representedRegions}</p></div>
            <div className="rounded-xl bg-black/30 p-3"><p className="text-xs text-slate-400">Catalogo provider</p><p className={"mt-1 text-sm font-black " + (desk.referenceState === "REFERENCE_ONLY" ? "text-cyan-300" : "text-amber-200")}>
              {desk.referenceState === "REFERENCE_ONLY" ? "Riferimenti recenti (non quotazioni)" : desk.referenceState === "REVIEW_OUTDATED" ? "Aggiornamento riferimenti da verificare" : "Riferimenti non verificati"}
            </p></div>
          </div>
          <p className="mt-3 text-xs text-amber-200">
            Ultima evidenza catalogo: {desk.referenceGeneratedAt ? new Date(desk.referenceGeneratedAt).toLocaleString("it-IT", {timeZone:"Europe/Rome"}) : "non disponibile"}.
            {" "}Le 205 mila voci circa comprendono anche strumenti non negoziabili con il tuo broker: non equivalgono a opportunità verificate.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {desk.regions.map(region => (
              <article key={region.id} className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-black">{region.name}</h3>
                  <span className={"text-xs font-black " + (region.attention === "REVIEW_NOW" ? "text-cyan-300" : "text-amber-200")}>
                    {region.attention === "REVIEW_NOW" ? "Ricerca durante la finestra" : region.attention === "VERIFY_REFERENCE" ? "Verificare le fonti" : "Preparare la ricerca"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400">Paesi con riferimenti provider: {region.matchedCountries ?? "?"}/{region.targetCountries}.
                  {" "}Finestre indicative: {region.indicativeResearchWindows}/{region.curatedVenues}.</p>
                <p className="mt-1 text-xs text-slate-400">Azioni ordinarie censite: {region.ordinaryShareReferences?.toLocaleString("it-IT") ?? "non verificato"}.
                  {" "}Warrant: {region.warrantReferences?.toLocaleString("it-IT") ?? "non verificato"}.</p>
                <div className="mt-3 space-y-2">
                  {desk.venues.filter(venue => venue.regionId === region.id).map(venue => (
                    <div key={venue.mic} className="flex items-start justify-between gap-2 border-t border-white/10 pt-2 text-xs">
                      <div>
                        <p className="font-semibold text-slate-200">{venue.name}</p>
                        <p className="text-slate-500">{venue.mic} · ora locale {venue.localTime ?? "?"}</p>
                      </div>
                      <span className={venue.researchWindowCandidate ? "text-cyan-300" : "text-slate-400"}>
                        {venue.researchWindowCandidate ? "Finestra indicativa" : "Fuori finestra / non confermata"}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-400">Non vengono richiesti dati a pagamento. Asia, Europa, Americhe e Africa restano in sola ricerca; nessuna operazione PAPER/LIVE internazionale autorizzata. Il PAPER V6 USA è separato e immutato.</p>
        </section>

        <section className="rounded-2xl border border-sky-400/25 bg-slate-900 p-5" aria-label="Screening azionario mondiale">
          <h2 className="text-xl font-black">Screening azionario mondiale · 2.000 riferimenti massimi</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Scansione automatica dei metadati azionari del provider, con eliminazione di warrant,
            duplicati e borse non riconciliate. Il campione è distribuito fra mercati, non selezionato per rendimento.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {[
              ["Strumenti esaminati",worldEquityFunnel.read],
              ["Azioni con identità di riferimento",worldEquityFunnel.accepted],
              ["Campione per la ricerca",worldEquityFunnel.selected],
              ["Regioni raggiunte",worldEquityFunnel.regions],
            ].map(([label,value])=><div key={label} className="rounded-xl bg-black/30 p-3">
              <p className="text-xs text-slate-400">{label}</p>
              <p className="mt-2 text-2xl font-black">{Number(value).toLocaleString("it-IT")}</p>
            </div>)}
          </div>
          <p className="mt-3 text-xs text-amber-200">
            {worldEquityFunnel.status==="AWAITING_FIRST_PROVIDER_SCAN"
              ?"In attesa della prima scansione completa del provider."
              :"Ultimo censimento: "+worldEquityFunnel.generatedAt+" · riferimenti anagrafici, NON segnali di acquisto."}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Nessuna quotazione, valutazione finanziaria o redditività è deducibile da questo risultato.
            L&apos;elenco individuale non viene pubblicato nel sito; PAPER internazionale e ordini reali bloccati.
          </p>
        </section>

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
