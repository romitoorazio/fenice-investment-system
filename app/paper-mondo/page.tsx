import Link from "next/link";
import master from "@/data/instrument-master.json";
import regionalSeeds from "@/data/world-paper-v7-research-seeds.json";
import funnel from "@/data/world-equity-funnel-status.json";
import reference from "@/data/global-reference-coverage.json";
import { runWorldPaperV7 } from "@/lib/trading/world-paper-v7.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Independent observation. This page never submits to the V6 OMS or any broker.
export default function WorldPaperPilotPage() {
  const report = runWorldPaperV7({
    nowIso: new Date().toISOString(), instruments: [...master.instruments, ...regionalSeeds.instruments],
    paperRunAuthorized: false, sessions: [], quotes: [], fx: [],
    entitlements: { sources: [], sessions: [], fx: [] },
  });
  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-3">
          <Link href="/global" className="text-sm text-cyan-300 underline">← Ricerca mondiale</Link>
          <p className="text-xs font-black uppercase tracking-widest text-amber-300">FENICE World PAPER V7 · indipendente dal V6</p>
          <h1 className="text-3xl font-black">Trading simulato mondiale: prove e lacune</h1>
          <p className="max-w-3xl text-sm text-slate-300">
            Non aspettiamo Wall Street per osservare Asia, Europa e America. Ogni borsa deve però dimostrare
            con dati propri la sessione aperta, due quotazioni indipendenti autorizzate,
            la valuta e una decisione valida prima di produrre un fill PAPER.
            Gli orari indicativi non sono prova di mercato aperto.
          </p>
        </header>
        <section className="grid gap-3 sm:grid-cols-4" aria-label="Prove mondiali">
          <div className="rounded-xl border border-white/15 p-4">
            <p className="text-xs text-slate-400">Riferimenti ricerca</p><p className="text-2xl font-black">{funnel.selected}</p>
            <p className="text-xs text-slate-500">{funnel.regions} regioni, non prezzi negoziabili</p>
          </div>
          <div className="rounded-xl border border-white/15 p-4">
            <p className="text-xs text-slate-400">Mercati pilota censiti</p>
            <p className="text-2xl font-black">{new Set(report.listings.map((row: { mic: string }) => row.mic)).size}</p>
            <p className="text-xs text-slate-500">Strumenti identificati per MIC</p>
          </div>
          <div className="rounded-xl border border-white/15 p-4">
            <p className="text-xs text-slate-400">Quotazioni PAPER mondiali certificate</p>
            <p className="text-2xl font-black">{report.summary.independentlyVerifiedListings}</p>
            <p className="text-xs text-amber-200">Non scambiare cataloghi per feed realtime</p>
          </div>
          <div className="rounded-xl border border-white/15 p-4">
            <p className="text-xs text-slate-400">Fill mondiali V7 confermati</p>
            <p className="text-2xl font-black">{report.summary.filledPaperOrders}</p>
            <p className="text-xs text-amber-200">Separati dai 7 fill storici V6</p>
          </div>
        </section>
        <section className="rounded-2xl border border-amber-300/30 bg-amber-400/5 p-4">
          <h2 className="font-black">Cosa serve per iniziare a simulare in ogni Borsa</h2>
          <p className="mt-2 text-sm text-slate-300">
            Il motore V7 e la simulazione con limiti e audit possono funzionare con dati verificati.
            Attualmente le fonti internazionali non sono ammesse automaticamente al PAPER:
            senza licenza, provenienza certa, due famiglie indipendenti, orologio della Borsa e FX recente
            il sistema deve fermarsi. Nessun fill sintetico viene aggiunto allo storico operativo.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Riferimenti acquisiti: {funnel.generatedAt} · Copertura Paesi: {reference.coverage.providerMatchedCountries}/{reference.coverage.targetCountries}.
            Il refresh della pagina aggiorna la diagnosi di ammissibilità, non scarica nuove quotazioni né apre ordini.
          </p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-black">Stato del pilota per regione</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {report.regions.map((region: { region: string; listedInPilot: number; verifiedPaperListings: number; blockedListings: number }) => (
              <article key={region.region} className="rounded-xl border border-white/15 bg-white/5 p-4">
                <h3 className="font-bold">{region.region}</h3>
                <p className="mt-1 text-sm">{region.listedInPilot} strumenti · {region.verifiedPaperListings} verificati PAPER</p>
                <p className="mt-1 text-xs text-amber-200">{region.blockedListings} richiedono prove di fonte/sessione/cambio</p>
              </article>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-white/15 p-4">
          <h2 className="font-black">Esito individuale, non soltanto USA</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {report.listings.map((row: { key: string; region: string; mic: string; currency: string; ready: boolean; reasons: string[] }) => (
              <div key={row.key} className="rounded-lg border border-white/10 p-3 text-sm">
                <p className="font-bold">{row.key} <span className="font-normal text-slate-400">({row.currency})</span></p>
                <p className="text-xs text-slate-400">{row.region}</p>
                <p className={row.ready ? "mt-1 text-xs text-emerald-300" : "mt-1 text-xs text-amber-200"}>
                  {row.ready ? "Dati PAPER verificati" : row.reasons.join(" · ")}
                </p>
              </div>
            ))}
          </div>
          <Link href="/api/paper/world-v7" className="mt-4 inline-block text-sm text-cyan-300 underline">
            Apri il rapporto JSON verificabile
          </Link>
        </section>
        <p className="text-xs text-slate-500">
          Capitale reale, Directa e ordini LIVE non accessibili da questo modulo. Il motore non modifica
          dati o limiti del V6. Nessuna nuova posizione di trading è stata creata aprendo questa pagina.
        </p>
      </div>
    </main>
  );
}
