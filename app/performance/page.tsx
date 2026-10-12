import Link from "next/link";
import paper from "@/data/paper-oms-state.json";
import v7 from "@/data/v7-decision-outcomes.json";
import calibration from "@/data/calibration-analysis.json";
import { reconcilePaperPositions, type PaperPositionSnapshot } from "@/lib/ui/paper-position-reconciliation";
import quotes from "@/data/execution-market-evidence.json";
import fx from "@/data/paper-fx-evidence.json";
import session from "@/data/paper-market-session.json";
import { valuePaperRecordedQuantities, type PaperValuationInputs } from "@/lib/ui/paper-valuation-evidence";
import {
  summarizePerformanceEvidence,
  type PaperOmsSnapshot,
  type V7OutcomesSnapshot,
  type CalibrationSnapshot,
} from "@/lib/ui/performance-evidence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const decimal = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const fxDecimal = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6 });

type EdgeRow = {
  horizon: string;
  pairedSamples: number;
  uniqueDays: number;
  buySignalSamples: number;
  waitOrAvoidSamples: number;
  historicalBackfillSamples: number;
  forwardObservedSamples: number;
  hypotheticalMeanReturnAfterCostPercent: number | null;
  hypotheticalMeanExcessVsBenchmarkPercent: number | null;
  hypotheticalBeatBenchmarkRatePercent: number | null;
};

type EdgeResearch = {
  version: number;
  benchmark: string;
  currency: string;
  assumedRoundTripCostPercent: number;
  hasVerifiedProfit: boolean;
  horizons: Record<string, EdgeRow>;
};

function serverRequestTime() {
  return Date.now();
}
function amount(value: number | null) {
  return value === null ? "N/D" : money.format(value);
}
function percent(value: number | null) {
  return value === null ? "N/D" : decimal.format(value) + "%";
}
function evidenceDate(value: string | null) {
  if (!value) return "dato non validato";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome",
  }).format(new Date(value));
}

export default function PerformancePage() {
  const requestedAt = serverRequestTime();
  const edge = (v7 as unknown as { researchEdge?: EdgeResearch }).researchEdge;
  const edgeRows = ["1d", "7d", "30d", "90d"].map(horizon => edge?.horizons?.[horizon]).filter((row): row is EdgeRow => Boolean(row));
  const report = summarizePerformanceEvidence(
    paper as PaperOmsSnapshot,
    v7 as V7OutcomesSnapshot,
    calibration as CalibrationSnapshot,
    requestedAt,
  );
  const holdings = reconcilePaperPositions(paper as PaperPositionSnapshot, requestedAt);
  const valuation = valuePaperRecordedQuantities({ paper, quotes, fx, session } as unknown as PaperValuationInputs, requestedAt);

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-24 pt-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-amber-300">Fenice · Performance Center</p>
            <h1 className="mt-2 text-3xl font-black">Fenice sta davvero guadagnando?</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Qui contano solo prove controllabili. Le operazioni PAPER sono simulate,
              le osservazioni V7 sono studi retrospettivi e il saldo Directa NON è collegato a questa pagina.
            </p>
          </div>
          <Link href="/" className="rounded-xl border border-white/20 px-4 py-2 text-sm">← Oggi</Link>
        </header>

        <section className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.04] p-5">
          <p className="text-sm font-black text-amber-200">Redditività netta non ancora dimostrata</p>
          <p className="mt-2 text-sm text-slate-200">
            Rendimento netto: <strong>{percent(report.netReturnPercent)}</strong> ·
            Utile netto: <strong>{amount(report.euroNetPnl)}</strong> ·
            Extra-rendimento rispetto al benchmark: <strong>{percent(report.benchmarkExcessReturnPercent)}</strong>.
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Manca uno storico affidabile del valore del portafoglio con prezzi, cambi e date confrontabili,
            operazioni chiuse, costi completi e benchmark. Un segnale corretto o un fill PAPER non dimostrano un profitto.
          </p>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-black">1. Esecuzioni simulate e costi</h2>
            <p className="mt-1 text-xs text-slate-400">Snapshot PAPER: {evidenceDate(report.paper.snapshotAt)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Fill PAPER registrati", report.paper.filledCount === null ? "N/D" : String(report.paper.filledCount)],
              ["Controvalore simulato", amount(report.paper.estimatedNotionalEuro)],
              ["Commissioni stimate", amount(report.paper.estimatedFeesEuro)],
              ["Slippage stimato", amount(report.paper.estimatedSlippageEuro)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="mt-2 text-xl font-black">{value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/10 p-4">
            <p className="text-sm">
              Costi combinati <strong>{amount(report.paper.estimatedCombinedCostsEuro)}</strong> ·
              Incidenza stimata sul controvalore <strong>{percent(report.paper.estimatedCostToNotionalPercent)}</strong>
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              {report.paper.costsComplete
                ? "Somma delle stime salvate per ciascun fill. Non rappresenta commissioni Directa addebitate, rendimenti realizzati o NAV aggiornato."
                : "Prove di costo insufficienti o incoerenti: nessuna stima aggregata viene mostrata come certa."}
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-black">1B. Riconciliazione delle posizioni PAPER</h2>
          <p className="text-xs text-slate-400">
            Prove: data/paper-oms-state.json · {evidenceDate(holdings.snapshotAt)} ·
            Controllo indipendente della corrispondenza fra fill e posizioni salvate
          </p>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className={holdings.status === "RECONCILED"
              ? "text-sm font-bold text-emerald-200" : "text-sm font-bold text-rose-200"}>
              {holdings.status === "RECONCILED"
                ? "Posizioni simulate riconciliate con gli acquisti"
                : "Riconciliazione non dimostrata — nessuna valorizzazione accettata"}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-300">{holdings.reason}</p>
            <p className="mt-2 text-xs text-slate-400">
              Posizioni riconciliate: {holdings.reconciledPositionCount ?? "N/D"} ·
              Lotti BUY PAPER: {holdings.filledBuyLots ?? "N/D"} ·
              Operazioni chiuse verificabili: {holdings.closedTradeCount ?? "N/D"}
            </p>
          </div>
          {holdings.status === "RECONCILED" && (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/[0.07] text-xs text-slate-300">
                  <tr>
                    <th className="p-3">Titolo</th>
                    <th className="p-3">Quote PAPER</th>
                    <th className="p-3">Prezzo medio storico</th>
                    <th className="p-3">Capitale ingresso EUR</th>
                    <th className="p-3">Costi stimati ingresso</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.rows.map(row => (
                    <tr key={row.symbol} className="border-t border-white/10">
                      <td className="p-3 font-black">{row.symbol}<span className="ml-1 text-xs font-normal text-slate-400">({row.buyLots} fill)</span></td>
                      <td className="p-3">{new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6 }).format(row.quantity)}</td>
                      <td className="p-3">{new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 }).format(row.weightedFillPrice)} {row.currency}</td>
                      <td className="p-3">{amount(row.entryNotionalEuro)}</td>
                      <td className="p-3">{amount(row.estimatedEntryCostsEuro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs leading-5 text-amber-200">
            Prezzi medi e cambi dei fill sono storici, non quotazioni correnti. La stima dei costi di
            entrata non equivale ai costi realmente addebitati da Directa. Mancano la quotazione
            indipendente aggiornata di ciascun titolo, il cambio EUR/USD coevo, la serie del NAV,
            la riconciliazione di eventuali vendite e un benchmark comparabile. Perciò profitto,
            perdita non realizzata e rendimento netto restano N/D anche se i lotti coincidono.
          </p>
        </section>

        <section className="space-y-3" aria-label="Valorizzazione del campione PAPER">
          <h2 className="text-xl font-black">1C. Valore delle quantità PAPER registrate</h2>
          <p className="text-xs leading-5 text-slate-400">
            Campione con due fonti indipendenti, cambio e sessione coevi. Questa misura non è il saldo Directa,
            il valore complessivo del portafoglio o un rendimento netto dimostrato.
          </p>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-bold text-amber-200">
              {valuation.state === "VALUED_SAMPLE" ? `Campione del ${evidenceDate(valuation.asOf)}` : "Valorizzazione N/D: prove coeve insufficienti"}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-300">{valuation.reason}</p>
            {valuation.state === "VALUED_SAMPLE" ? (
              <p className="mt-2 text-xs text-slate-400">
                {valuation.sampleCurrentWithin120Seconds ? "Campione recente" : "Campione storico: prezzi scaduti per nuove esecuzioni"} ·
                Ordini reali sempre bloccati.
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Valore indicativo delle quantità", amount(valuation.estimatedRecordedQuantityValueEuro)],
              ["Controvalore storico ingresso", amount(valuation.recordedEntryEuro)],
              ["Variazione prezzi e cambio", amount(valuation.priceFxChangeEuro)],
              ["Dopo commissioni ingresso stimate", amount(valuation.changeAfterEstimatedEntryFeesEuro)],
            ].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 p-4">
              <p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-xl font-black">{value}</p>
            </div>)}
          </div>
          {valuation.state === "VALUED_SAMPLE" ? (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <caption className="p-3 text-left text-xs text-slate-400">Prove del campione: prezzi mediani, cambio e quantità del registro PAPER</caption>
                <thead className="bg-white/[0.07] text-xs text-slate-300"><tr>
                  <th scope="col" className="p-3">Titolo</th><th scope="col" className="p-3">Prezzo campionato</th>
                  <th scope="col" className="p-3">Cambio in EUR</th><th scope="col" className="p-3">Valore indicativo</th>
                </tr></thead>
                <tbody>{valuation.rows.map(row => <tr key={row.symbol} className="border-t border-white/10">
                  <th scope="row" className="p-3">{row.symbol}</th><td className="p-3">{decimal.format(row.medianPrice)} {row.currency}</td>
                  <td className="p-3">{fxDecimal.format(row.fxToEuro)}</td>
                  <td className="p-3">{amount(row.estimatedValueEuro)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          ) : null}
          <p className="text-xs leading-5 text-amber-200">
            Lo slippage simulato è già incluso nel prezzo dei fill e non viene sottratto due volte.
            La variazione dopo le commissioni stimate d’ingresso esclude costi d’uscita, imposte,
            dividendi e azioni societarie non riconciliati. Utile realizzato, NAV e confronto con il benchmark restano N/D.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-black">2. Strategie V7 — risultati delle decisioni</h2>
          <p className="text-xs text-slate-400">
            Snapshot V7: {evidenceDate(report.v7.snapshotAt)} ·
            Righe nel registro diagnostico: {report.v7.ledgerRecordCount ?? "N/D"}
          </p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.07] text-xs text-slate-300">
                <tr><th className="p-3">Orizzonte</th><th className="p-3">Osservazioni</th><th className="p-3">Acquisti valutati</th><th className="p-3">Bias di attesa</th></tr>
              </thead>
              <tbody>
                {report.v7.horizons.map(row => (
                  <tr key={row.horizon} className="border-t border-white/10">
                    <td className="p-3 font-bold">{row.horizon}</td>
                    <td className="p-3">{row.totalDecisionObservations ?? "N/D"}</td>
                    <td className="p-3">{row.buySamples ?? "N/D"}</td>
                    <td className="p-3 text-slate-300">{row.restraintBias}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-300">
            {report.v7.hasValidatedBuyOutcomes
              ? "Esistono campioni COMPRA da analizzare; servono ancora rendimenti netti, costi e benchmark verificati."
              : "Non ci sono campioni COMPRA sufficienti a dimostrare che Fenice selezioni acquisti redditizi. Le centinaia di osservazioni ATTENDI/EVITA non sono profitti."}
          </p>
        </section>

        <section className="space-y-3" aria-label="Ricerca del vantaggio netto rispetto al benchmark">
          <h2 className="text-xl font-black">2B. Opportunità ipotetiche rispetto al mercato</h2>
          <p className="text-sm leading-6 text-slate-300">
            Ricerca retrospettiva sulle decisioni V7: confronto fra variazione del prezzo di ciascun titolo
            in USD e variazione di SPY nelle stesse date di ingresso e uscita.
            Il modello sottrae il costo ipotetico di andata e ritorno del {edge?.assumedRoundTripCostPercent ?? 0.3}% alle
            opportunità, non al benchmark. Non sono operazioni realmente eseguite.
          </p>
          {edge && edgeRows.length ? (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/[0.07] text-xs text-slate-300">
                  <tr>
                    <th scope="col" className="p-3">Orizzonte</th>
                    <th scope="col" className="p-3">Confronti validi</th>
                    <th scope="col" className="p-3">Giorni distinti</th>
                    <th scope="col" className="p-3">Segnali COMPRA</th>
                    <th scope="col" className="p-3">In avanti / retrospettivi</th>
                    <th scope="col" className="p-3">Extra-rendimento ipotetico medio</th>
                    <th scope="col" className="p-3">Superano SPY dopo costo</th>
                  </tr>
                </thead>
                <tbody>
                  {edgeRows.map(row => (
                    <tr key={row.horizon} className="border-t border-white/10">
                      <th scope="row" className="p-3 font-bold">{row.horizon}</th>
                      <td className="p-3">{row.pairedSamples}</td>
                      <td className="p-3">{row.uniqueDays}</td>
                      <td className="p-3">{row.buySignalSamples}</td>
                      <td className="p-3">{row.forwardObservedSamples} / {row.historicalBackfillSamples}</td>
                      <td className="p-3">{row.pairedSamples ? percent(row.hypotheticalMeanExcessVsBenchmarkPercent) : "N/D"}</td>
                      <td className="p-3">{row.pairedSamples ? percent(row.hypotheticalBeatBenchmarkRatePercent) : "N/D"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="rounded-xl border border-white/10 p-4 text-sm text-amber-200">Ricerca comparativa non ancora calcolata: N/D.</p>}
          <p className="text-xs leading-5 text-slate-400">
            In avanti = segnali osservati dal registro prima della scadenza; retrospettivi = eventi
            ricostruiti da snapshot del Comitato. Più titoli nella stessa giornata non sono osservazioni indipendenti.
            Nessuno dei due insiemi dimostra un profitto eseguito.
          </p>
          <p className="text-xs leading-5 text-amber-200">
            Un extra-rendimento positivo in questa tabella NON è un profitto di Fenice: comprende anche ATTENDI, OSSERVA
            ed EVITA, cioè acquisti ipotetici che il sistema non ha consigliato. I campioni ripetuti sono correlati e le
            osservazioni storiche non costituiscono una prova fuori campione. Il confronto esclude azioni societarie,
            dividendi, cambi EUR/USD e imposte, e usa costi stimati, non addebiti Directa. Per dimostrare redditività
            servono segnali COMPRA verificabili e una serie netta del portafoglio; il saldo reale resta N/D.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-black">3. Calibrazione della capacità di acquisto</h2>
          <p className="text-xs text-slate-400">Snapshot: {evidenceDate(report.calibration.snapshotAt)}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {report.calibration.horizons.map(item => (
              <div key={item.horizon} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-bold text-slate-300">{item.horizon}</p>
                <p className="mt-2 font-black text-amber-200">{item.state}</p>
                <p className="mt-1 text-xs text-slate-400">Campioni validi: {item.sampleSize ?? "N/D"}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 p-4 text-sm text-slate-300">
          <p className="font-bold text-white">Cosa serve prima di parlare di rendimento</p>
          <p className="mt-2 leading-6">
            Rendimenti forward senza look-ahead, commissioni/FX/spread verificati,
            valorizzazioni giornaliere, posizioni riconciliate e confronto corretto con ETF e liquidità.
            Questa pagina è di sola lettura, non modifica V6, non invia ordini e non abilita il trading LIVE.
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            <Link href="/decisioni" className="text-cyan-300 underline">Segnali Compra/Vendi</Link>
            <Link href="/readiness" className="text-cyan-300 underline">Stato certificazione</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
