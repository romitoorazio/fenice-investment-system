const indicators = [
  { label: "Geopolitica", value: 65 },
  { label: "Macroeconomia", value: 74 },
  { label: "Mercati globali", value: 80 },
  { label: "Intelligenza artificiale", value: 96 },
  { label: "Biotech", value: 88 },
  { label: "Agritech", value: 84 },
];

const companies = [
  { ticker: "CRSP", name: "CRISPR Therapeutics", score: 87 },
  { ticker: "RXRX", name: "Recursion Pharmaceuticals", score: 84 },
  { ticker: "NTLA", name: "Intellia Therapeutics", score: 81 },
  { ticker: "BIOX", name: "Bioceres Crop Solutions", score: 73 },
  { ticker: "EVGN", name: "Evogene", score: 65 },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-amber-400">
            Progetto 100.000 €
          </p>
          <h1 className="text-4xl font-bold tracking-tight">
            Fenice Investment System
          </h1>
          <p className="mt-3 max-w-3xl text-slate-400">
            Monitoraggio di geopolitica, economia, mercati e aziende innovative
            con un orizzonte di investimento di dieci anni.
          </p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Verdetto operativo</p>
            <p className="mt-2 text-2xl font-bold text-amber-400">ATTENDERE</p>
          </article>
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Indice opportunità</p>
            <p className="mt-2 text-2xl font-bold">76/100</p>
          </article>
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Indice rischio</p>
            <p className="mt-2 text-2xl font-bold">58/100</p>
          </article>
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Capitale disponibile</p>
            <p className="mt-2 text-2xl font-bold">10.000 €</p>
          </article>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-5 text-xl font-semibold">Scenario mondiale</h2>
          <div className="grid gap-5 md:grid-cols-2">
            {indicators.map((indicator) => (
              <div key={indicator.label}>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-300">{indicator.label}</span>
                  <span className="font-semibold">{indicator.value}/100</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-amber-400"
                    style={{ width: `${indicator.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Classifica aziende</h2>
            <span className="text-sm text-slate-400">Top 5 provvisoria</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left">
              <thead>
                <tr className="border-b border-slate-800 text-sm text-slate-400">
                  <th className="pb-3">Posizione</th>
                  <th className="pb-3">Ticker</th>
                  <th className="pb-3">Azienda</th>
                  <th className="pb-3 text-right">Punteggio</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company, index) => (
                  <tr
                    key={company.ticker}
                    className="border-b border-slate-800/70 last:border-none"
                  >
                    <td className="py-4">{index + 1}</td>
                    <td className="py-4 font-semibold text-amber-400">
                      {company.ticker}
                    </td>
                    <td className="py-4">{company.name}</td>
                    <td className="py-4 text-right font-semibold">
                      {company.score}/100
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
