import Link from "next/link";
import { buildMultiBrokerReadiness } from "@/lib/brokers/multi-broker-readiness";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function BrokersPage() {
  const overview = buildMultiBrokerReadiness();
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 pb-24 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-7">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          <Link href="/" className="text-sm font-bold text-cyan-300 hover:underline">← Torna a Fenice</Link>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.25em] text-amber-300">Fenice100K · Multi-Broker</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Directa + eToro</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            Due broker nello stesso piano, ma conti separati. Il pannello indica la preparazione
            tecnica, non prova una connessione al tuo conto, non mostra un saldo e non esegue ordini.
          </p>
          <p className="mt-3 text-sm font-semibold text-amber-200">
            Connessioni ai conti verificate: {overview.verifiedBrokerConnections} · Trading reale: bloccato
          </p>
        </header>
        <section className="grid gap-4 sm:grid-cols-2" aria-label="Stato broker">
          {overview.brokers.map((broker) => (
            <article key={broker.id} className="rounded-2xl border border-white/10 bg-slate-900 p-6">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-2xl font-black">{broker.label}</h2>
                <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-200">
                  {broker.status === "PREPARED_UNVERIFIED" ? "Ponte predisposto" : "Non collegato"}
                </span>
              </div>
              <p className="mt-5 text-sm text-slate-300">
                {broker.mode === "LOCAL_READ_ONLY"
                  ? "Ponte locale in sola lettura: disponibilità nel codice, connessione al PC da verificare."
                  : "Adattatore demo in sola lettura predisposto nel codice; nessuna chiave o sessione eToro collegata."}
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-400">{broker.nextStep}</p>
              <div className="mt-5 rounded-xl border border-white/10 p-3 text-xs text-slate-300">
                Dati conto: non disponibili · Ordini reali: disabilitati
              </div>
            </article>
          ))}
        </section>
        <section className="rounded-2xl border border-white/10 p-6">
          <h2 className="text-xl font-bold">Prossima integrazione</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Il passo successivo è verificare un account eToro idoneo, poi aggiungere
            un adattatore DEMO con credenziali Read. Nessun dato eToro viene inoltrato
            a Directa: la condivisione fra broker richiede una verifica separata delle licenze.
            Il core PAPER V6 e il blocco degli ordini restano invariati.
          </p>
          <a
            className="mt-4 inline-block text-sm font-semibold text-cyan-300 underline"
            href="https://builders.etoro.com/get-started"
            target="_blank"
            rel="noreferrer noopener"
          >
            Documentazione ufficiale API eToro
          </a>
        </section>
      </div>
    </main>
  );
}
