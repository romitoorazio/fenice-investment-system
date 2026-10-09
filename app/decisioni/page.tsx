import Link from "next/link";
import terminal from "@/data/terminal-intelligence.json";
import globalCoverage from "@/data/global-reference-coverage.json";
import master from "@/data/instrument-master.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Asset = {
  symbol: string; name: string; decision: string; unifiedScore?: number;
  confidence?: number; price?: number; currency?: string; reason?: string;
  warnings?: string[]; technical?: { observedAt?: string };
};
const data = terminal as { generatedAt: string; mode: string; assets: Asset[]; capitalEuro?: number };
const catalog = globalCoverage as { coverage: { matchedInstrumentReferences: number; providerMatchedCountries: number; targetCountries: number }; generatedAt: string };
const instruments = master as { instruments: Array<{status: string; exchangeMic?: string | null }> };
const groups = [
  { key: "ACCUMULA", heading: "Studiare per possibile acquisto", explain: "Segnale di ricerca positivo, NON un ordine d'acquisto.", accent: "text-emerald-300" },
  { key: "MANTIENI", heading: "Mantenere / sorvegliare", explain: "Mantenere ha senso solo se il titolo è già in portafoglio.", accent: "text-sky-300" },
  { key: "ATTENDI", heading: "Attendere", explain: "Nessun nuovo ingresso proposto dal modello.", accent: "text-amber-300" },
  { key: "EVITA", heading: "Evitare / valutare la vendita", explain: "Per vendere servono posizione reale, prezzo di carico, costi e situazione fiscale; EVITA non è un ordine di vendita.", accent: "text-rose-300" },
  { key: "SPECULATIVA", heading: "Solo studio speculativo", explain: "Rischio elevato, mai da interpretare come acquisto approvato.", accent: "text-violet-300" },
];

function formatMoney(value?: number, currency?: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  try { return new Intl.NumberFormat("it-IT", { style: "currency", currency: currency || "USD" }).format(value); }
  catch { return String(value); }
}
function isCurrent(now: number, timestamp?: string) {
  const parsed = Date.parse(String(timestamp || ""));
  return Number.isFinite(parsed) && parsed <= now && now - parsed <= 36 * 3600_000;
}
export default function DecisioniPage() {
  const now = Date.now();
  const researchCurrent = isCurrent(now, data.generatedAt);
  const assets = [...(data.assets || [])];
  const monitoredExchanges = new Set(instruments.instruments.filter(x => x.status === "active").map(x => x.exchangeMic).filter(Boolean)).size;
  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-16 pt-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-cyan-300">Fenice · Centro decisioni</p>
            <h1 className="mt-2 text-3xl font-black">Comprare, mantenere o vendere?</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Segnali di studio generati dal motore tecnico. Nessun acquisto o vendita è autorizzato da questa pagina.
              Controlla sempre prezzi eseguibili, posizione presso il broker e rischio prima di decidere.
            </p>
          </div>
          <Link href="/" className="rounded-lg border border-white/20 px-4 py-2 text-sm">← Oggi</Link>
        </header>
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="font-bold text-amber-200">{researchCurrent ? "Ricerca giornaliera disponibile · NON prezzi eseguibili" : "RICERCA SCADUTA · NON AGIRE SU QUESTI SEGNALI"}</p>
          <p className="mt-1 text-sm text-slate-300">Ultimo calcolo: {data.generatedAt} · Prezzi PAPER con quorum indipendente e abilitazione LIVE da verificare separatamente. Ordini REALI: BLOCCATI.</p>
        </section>
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Titoli nel motore tecnico", String(assets.length)],
            ["Nucleo censito", String(instruments.instruments.filter(x => x.status === "active").length)],
            ["Sedi di negoziazione censite", String(monitoredExchanges)],
            ["Riferimenti mondiali (NON realtime)", catalog.coverage.matchedInstrumentReferences.toLocaleString("it-IT")],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}
        </section>
        <div className="rounded-xl border border-white/10 p-4 text-sm text-slate-300">
          <p className="font-bold text-white">Significato delle categorie</p>
          <p className="mt-2">Le etichette sotto derivano dal modello di ricerca, non da operazioni disponibili su Directa. Il numero di strumenti disponibili nel catalogo globale non rappresenta un controllo continuo di tutti i mercati. La vendita è valutabile solo per titoli effettivamente posseduti.</p>
          <div className="mt-3 flex flex-wrap gap-3"><Link className="text-cyan-300 underline" href="/mercati">Stato borse e quotazioni</Link><Link className="text-cyan-300 underline" href="/portfolio">Portafoglio</Link><Link className="text-cyan-300 underline" href="/readiness">Sicurezza</Link><Link className="text-cyan-300 underline" href="/global">Copertura globale</Link></div>
        </div>
        {groups.map(group => {
          const rows = assets.filter(item => item.decision === group.key).sort((a,b)=>(b.unifiedScore || 0)-(a.unifiedScore || 0));
          return <section key={group.key} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className={`text-xl font-black ${group.accent}`}>{group.heading} ({rows.length})</h2><p className="text-xs text-slate-400">{group.explain}</p></div>
            {rows.length === 0 ? <p className="text-sm text-slate-400">Nessun titolo in questa categoria.</p> :
              <div className="grid gap-3 md:grid-cols-2">{rows.map(asset => {
                const quoteDate = asset.technical?.observedAt;
                const fresh = researchCurrent && isCurrent(now, quoteDate);
                return <article key={asset.symbol} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{asset.symbol}</h3><p className="text-sm text-slate-400">{asset.name}</p></div><div className="text-right"><p className="text-lg font-bold">{formatMoney(asset.price,asset.currency)}</p><p className="text-xs text-slate-400">Prezzo campionato</p></div></div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs"><span>Punteggio: {asset.unifiedScore ?? "—"}/100</span><span>Confidenza modello: {asset.confidence ?? "—"}%</span><span className={fresh ? "text-amber-300" : "text-rose-300"}>{fresh ? "Dati giornalieri, non eseguibili" : "Prezzo non verificato recente"}</span></div>
                  <p className="mt-3 text-sm text-slate-300">{asset.reason || "Motivazione non disponibile."}</p>
                  {!!asset.warnings?.length && <p className="mt-2 text-xs text-amber-200">Avvertenza: {asset.warnings[0]}</p>}
                  <p className="mt-2 text-xs text-slate-500">Osservazione: {quoteDate || "non disponibile"} · Nessun ordine consentito.</p>
                </article>;
              })}</div>}
          </section>;
        })}
        <footer className="text-xs text-slate-500">La schermata non costituisce consulenza personalizzata. La dimensione del portafoglio modello non è il saldo del conto broker. Il sistema non dispone qui di conferma delle tue posizioni reali o di prezzi negoziabili aggiornati.</footer>
      </div>
    </main>
  );
}
