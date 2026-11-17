import Link from 'next/link';
import type {WorldTacticalEvidence} from '@/lib/ui/one-global-world-radar-runtime.mjs';
export default function WorldEquityRadar({evidence}:{evidence:WorldTacticalEvidence}){
  const {radar,dataHealth,source}=evidence;
  return <section className="space-y-4 rounded-2xl border border-emerald-400/25 bg-slate-900 p-5" aria-label="Azioni mondiali: opportunità di ricerca">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-widest text-emerald-300">ONE GLOBAL · Azioni mondiali</p>
        <h2 className="mt-2 text-xl font-black text-white">Opportunità da approfondire</h2>
        <p className="mt-2 text-sm text-slate-300">2–10 sedute e 2–8 settimane · Indicatori da sedute completate.</p></div>
      <Link href="/opportunita-mondo" className="text-xs font-bold text-emerald-200 underline">Tutti i titoli e le prove →</Link>
    </div>
    <p className="text-xs text-slate-400">{source}. Aggiornamento: {radar?.terminalAsOf??'non verificato'}.</p>
    {radar&&!radar.stale?<>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
        <p><strong className="text-white">{radar.researchEligible}</strong> azioni esaminabili</p>
        <p><strong className="text-emerald-300">{radar.momentumCount}</strong> momentum da studiare</p>
        <p><strong className="text-sky-300">{radar.trendCount}</strong> trend da studiare</p>
        <p><strong className="text-white">{dataHealth?.research.marketsWithRecentDailyResearch??'—'}</strong> mercati con dati recenti</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {radar.watchlist.slice(0,6).map(row=><article key={row.key} className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-slate-400">{row.venueMic??'Borsa da verificare'} · {row.region}</p>
          <h3 className="mt-1 font-bold text-white">{row.symbol} · {row.name}</h3>
          <p className="mt-2 text-xs text-emerald-200">2–10 sedute: {row.shortAttention} · {row.shortScore}/100</p>
          <p className="mt-1 text-xs text-sky-200">2–8 settimane: {row.mediumAttention} · {row.mediumScore}/100</p>
        </article>)}
      </div>
    </>:<p className="text-sm text-amber-200">Dati azionari non verificabili o da aggiornare: ricerca corrente non disponibile.</p>}
    <p className="text-xs leading-5 text-slate-400">Queste opportunità restano visibili durante la validazione PAPER. Il giudizio tecnico, la decisione COMPRA e il FILL verificato sono passaggi distinti.</p>
    <div className="flex flex-wrap gap-3 text-xs text-cyan-300">
      <Link href="/mercati" className="underline">Stato dei mercati</Link>
      <Link href="/api/sources/global" className="underline">Raggiungibilità, qualità dati e prove PAPER</Link>
      <Link href="/recupero-paper" className="underline">Registro PAPER privato</Link>
    </div>
  </section>;
}
