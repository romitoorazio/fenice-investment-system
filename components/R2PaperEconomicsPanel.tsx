"use client";
import {useState} from "react";
type Trade={key:string;side:string;sessionDate:string;quantity:number;executionUnitEuro:number;feeEuro:number;estimatedSlippageEuro:number;realizedNetEuro:number|null};
type Position={key:string;quantity:number;costEuro:number;entryUnitEuro:number;currentUnitEuro:null;currentValueEuro:null;unrealizedNetEuro:null};
type Economics={state:string;initialCapitalEuro:number;cashEuro:number;investedCostEuro:number;portfolioValueEuro:number|null;realizedNetEuro:number;unrealizedNetEuro:number|null;netReturnPercent:number|null;feesEuro:number;estimatedSlippageEuro:number;maxDrawdownPercent:number|null;winRatePercent:number|null;profitFactor:number|null;benchmarkReturnPercent:number|null;closedRoundTrips:number;fillCount:number;positions:Position[];trades:Trade[];historyTruncated:boolean};
const fmt=(n:number|null|undefined,suffix=" €")=>typeof n==="number"&&Number.isFinite(n)?n.toLocaleString("it-IT",{maximumFractionDigits:4})+suffix:"N/D";
export default function R2PaperEconomicsPanel(){
  const [data,setData]=useState<Economics|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  async function refresh(){
    setBusy(true);setError(false);setData(null);
    try{
      const response=await fetch("/api/paper/one-global-r2-economics",{credentials:"same-origin",cache:"no-store"});
      const payload=await response.json();
      if(!response.ok||payload.state!=="R2_ECONOMICS_REPLAY_VERIFIED")throw Error();
      setData(payload);
    }catch{setError(true);}finally{setBusy(false);}
  }
  return <section style={{marginTop:18,padding:16,border:"1px solid #475569",borderRadius:10}} aria-label="Risultati economici PAPER R2">
    <h2 style={{fontWeight:600}}>Risultati economici PAPER R2</h2>
    <p>Solo eventi prospettici del journal privato verificato. Nessun backtest, collaudo sintetico o ordine reale.</p>
    <button type="button" disabled={busy} onClick={()=>void refresh()}>Aggiorna risultati</button>
    {busy?<p role="status">Verifica in corso...</p>:null}
    {error?<p role="alert">Dati economici non verificati. Nessun valore presunto.</p>:null}
    {data?<div>
      <dl style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      {[
        ["Capitale iniziale",fmt(data.initialCapitalEuro)],["Liquidità",fmt(data.cashEuro)],
        ["Capitale investito (costo)",fmt(data.investedCostEuro)],["Valore portafoglio",fmt(data.portfolioValueEuro)],
        ["P&L netto realizzato",fmt(data.realizedNetEuro)],["P&L non realizzato",fmt(data.unrealizedNetEuro)],
        ["Rendimento netto",fmt(data.netReturnPercent,"%")],["Commissioni simulate",fmt(data.feesEuro)],
        ["Slippage stimato (già nei fill)",fmt(data.estimatedSlippageEuro)],["Drawdown massimo",fmt(data.maxDrawdownPercent,"%")],
        ["Operazioni profittevoli",fmt(data.winRatePercent,"%")],["Profit factor",fmt(data.profitFactor,"")],
        ["Benchmark",fmt(data.benchmarkReturnPercent,"%")],["Operazioni chiuse",fmt(data.closedRoundTrips,"")]
      ].map(([label,value])=><div key={label}><dt>{label}</dt><dd style={{fontWeight:600}}>{value}</dd></div>)}
      </dl>
      <p>N/D: quotazioni correnti, serie patrimoniale o benchmark non verificati; profit factor non definito senza perdite chiuse. Qualità IA: consultare le evidenze prospettiche in Performance, non deducibile dai fill.</p>
      <h3>Posizioni aperte ({data.positions.length})</h3>
      {data.positions.length?data.positions.map(p=><p key={p.key}>{p.key}: {p.quantity} unità · ingresso {fmt(p.entryUnitEuro)} · costo {fmt(p.costEuro)} · corrente {fmt(p.currentUnitEuro)} · P&amp;L {fmt(p.unrealizedNetEuro)}</p>):<p>Nessuna posizione.</p>}
      <h3>Storico fill ({data.fillCount})</h3>
      {data.historyTruncated?<p>Ultimi 100 fill; aggregati calcolati sull’intero journal.</p>:null}
      {data.trades.length?data.trades.map((t,i)=><p key={i}>{t.sessionDate} · {t.side} {t.key} · {t.quantity} × {fmt(t.executionUnitEuro)} · costo commissione {fmt(t.feeEuro)} · slippage {fmt(t.estimatedSlippageEuro)} · P&amp;L {fmt(t.realizedNetEuro)}</p>):<p>Nessuna operazione PAPER autentica registrata.</p>}
    </div>:null}
  </section>;
}
