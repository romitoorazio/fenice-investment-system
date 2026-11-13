/** Phase 7 world operational research brief. No broker, orders or executable PAPER. */
export const PHASE7_MODE="PHASE7_WORLD_RESEARCH_DAILY_BRIEF";
const fail=reason=>{throw Error(reason);};
const safe=s=>String(s??"").replace(/[\r\n|<>\[\]]/g,"").slice(0,100);
const signed=n=>(n<0?"−":"+")+"€"+Math.abs(n).toFixed(2).replace(".",",");
export function buildPhase7WorldBrief({research,forward,risk,historical,nowIso=new Date().toISOString()}={}){
 const now=Date.parse(nowIso);
 if(!Number.isFinite(now))fail("PHASE7_INVALID_CLOCK");
 if(!research||!forward||!risk||!historical||
  research.mode!=="PUBLIC_UNATTESTED_WORLD_RESEARCH"||
  forward.mode!=="PHASE5_FORWARD_UNATTESTED_VIRTUAL_RESEARCH"||
  risk.mode!=="PHASE6_VIRTUAL_FORWARD_RISK_RESEARCH_ONLY"||
  historical.mode!=="PHASE5_HISTORICAL_VIRTUAL_PORTFOLIO_NOT_LIVE"||
  !Array.isArray(research.watchlist?.candidates)||!Array.isArray(forward.openPositions)||
  !Array.isArray(forward.rejected))fail("PHASE7_INVALID_SOURCE");
 for(const o of [research,forward,risk,historical])
  if(o.ordersGenerated!==0||o.realPaperCertified!==false||o.liveTradingAllowed!==false)
   fail("PHASE7_BROKER_SAFETY_FAILURE");
 if(forward.paperFillAuthorized!==false||risk.ledgerHeadHash!==forward.ledgerHeadHash||
  risk.riskState!==forward.riskState?.riskState||
  risk.haltNewVirtualEntries!==forward.riskState?.haltNewVirtualEntries||
  risk.closedTrades!==forward.closedTrades||risk.wins!==forward.wins||
  risk.losses!==forward.losses||risk.realizedNetPnlEuro!==forward.realizedNetPnlEuro)
   fail("PHASE7_LEDGER_RISK_MISMATCH");
 if(research.coveragePolicy?.requested!==8||
  research.coveragePolicy?.verifiedForPaper!==false||
  research.coveragePolicy.ranked!==research.watchlist.candidates.length||
  JSON.stringify(research.coveragePolicy)!==JSON.stringify(forward.sourceCoverage))
   fail("PHASE7_COVERAGE_MISMATCH");
 for(const t of [research.generatedAt,forward.generatedAt,risk.generatedAt]){
  if(!Number.isFinite(Date.parse(t))||Date.parse(t)>now)fail("PHASE7_TIME_MISMATCH");
 }
 const seen=new Set();
 const ranked=research.watchlist.candidates.map(c=>{
  if(!c||typeof c.mic!=="string"||typeof c.instrumentId!=="string"||
   !c.instrumentId.startsWith(c.mic+":")||!Number.isFinite(c.score)||
   c.dataVerified!==false||c.executable!==false||
   !Number.isFinite(Date.parse(c.observedAt))||Date.parse(c.observedAt)>now||
   !String(c.sourceUrl??"").startsWith("https://query1.finance.yahoo.com/v8/finance/chart/")||
   seen.has(c.instrumentId))fail("PHASE7_INVALID_RESEARCH_ITEM");
  seen.add(c.instrumentId);
  return {mic:c.mic,instrumentId:c.instrumentId,score:c.score,observedAt:c.observedAt,
   verified:false,executable:false,positionOpen:forward.openPositions.some(p=>p.instrumentId===c.instrumentId)};
 }).sort((a,b)=>b.score-a.score||a.instrumentId.localeCompare(b.instrumentId));
 const opportunities=ranked.filter(c=>c.score>0).slice(0,5).map((c,i)=>({...c,rank:i+1,
  label:"MOMENTUM_POSITIVE_RESEARCH_NOT_BUY"}));
 const warnings=[...new Set(forward.rejected.filter(r=>r&&typeof r.reason==="string").map(r=>r.reason))];
 if(risk.haltNewVirtualEntries)warnings.push("PHASE6_RISK_HALT");
 if(!opportunities.length)warnings.push("NO_POSITIVE_MOMENTUM_IN_EIGHT_SYMBOL_SAMPLE");
 return {schemaVersion:1,mode:PHASE7_MODE,generatedAt:nowIso,
  universe:{requested:8,received:research.coveragePolicy.received,ranked:ranked.length,
   venues:ranked.map(r=>r.mic),warning:"ONLY_EIGHT_SYMBOLS_ONE_PER_MARKET_NOT_FULL_WORLD_SCAN"},
  opportunities,rankedResearch:ranked,forward:{openPositions:forward.openPositions.length,
   closedTrades:forward.closedTrades,wins:forward.wins,losses:forward.losses,
   netRealizedEuro:forward.realizedNetPnlEuro,availableCashEuro:forward.cashEuro,
   ledgerHeadHash:forward.ledgerHeadHash},
  historicalSeparate:{netPnlEuro:historical.netPnlEuro,endingCashEuro:historical.endingCashEuro},
  risk:{status:risk.riskState,haltNewVirtualEntries:risk.haltNewVirtualEntries,
   drawdownPct:risk.maxRealizedDrawdownPct},
  warnings,observedSourceTime:research.generatedAt,
  provenance:"PUBLIC_YAHOO_CHART_UNATTESTED_ECB_REFERENCE_INDICATIVE",
  certifiedPaper:false,liveTradingAllowed:false,ordersGenerated:0,brokerContacted:false,
  disclosure:"Virtual closes only; no executable quotes, certified PAPER fills or Directa orders"};
}
export function formatPhase7WorldMarkdown(o){
 if(o?.mode!==PHASE7_MODE||o.ordersGenerated!==0||o.liveTradingAllowed!==false)
  fail("PHASE7_FORMAT_INVALID");
 const lines=["# FENICE ONE GLOBAL — Report operativo mondiale", "",
 "Aggiornato: "+o.generatedAt+" | Ordini Directa: **0** | PAPER certificato: **NO**", "",
 "## Copertura e opportunità (ricerca, non consigli di acquisto)",
 "Copertura: "+o.universe.received+"/8 strumenti, uno per borsa. **Questo campione non esamina tutte le azioni mondiali.**", "",
 "| Posizione | Borsa | Strumento | Punteggio | Stato |","|---:|---|---|---:|---|"];
 if(!o.opportunities.length)lines.push("| — | — | Nessun punteggio positivo | — | In attesa |");
 for(const t of o.opportunities)lines.push("| "+t.rank+" | "+safe(t.mic)+" | "+safe(t.instrumentId)+
  " | "+t.score.toFixed(4)+" | "+(t.positionOpen?"Virtuale aperta":"Da osservare")+" |");
 lines.push("","## Portafoglio forward (simulazione non certificata)",
 "- Posizioni aperte: **"+o.forward.openPositions+"**; chiuse: **"+o.forward.closedTrades+"**",
 "- Esiti: **"+o.forward.wins+" positivi / "+o.forward.losses+" negativi**",
 "- Risultato forward realizzato: **"+signed(o.forward.netRealizedEuro)+"**",
 "- Liquidità virtuale, esclusa valorizzazione posizioni aperte: **€"+o.forward.availableCashEuro.toFixed(2).replace(".",",")+"**",
 "- Rischio: **"+safe(o.risk.status)+"**; nuove posizioni virtuali: "+(o.risk.haltNewVirtualEntries?"BLOCCATE":"sottoposte ai limiti"),
 "","## Backtest distinto dal forward",
 "- Risultato storico: **"+signed(o.historicalSeparate.netPnlEuro)+"** (non va sommato al forward)",
 "","## Trasparenza","- Fonte: Yahoo Finance pubblico non attestato; cambi BCE indicativi",
 "- Ledger forward: "+safe(o.forward.ledgerHeadHash),
 "- Prezzi non eseguibili; nessun fill PAPER certificato e nessun ordine Directa",
 "","## Avvisi");
 if(o.warnings.length)for(const w of o.warnings)lines.push("- "+safe(w));
 else lines.push("- Nessun altro blocco di ricerca segnalato");
 lines.push("","## Registri originali",
 "- [Registro forward](phase5-forward-ledger.json)",
 "- [Portafoglio virtuale](latest-phase5-forward-research-portfolio.json)",
 "- [Rischio](latest-phase6-forward-risk-report.json)",
 "- [Storico](latest-phase5-historical-portfolio.json)","",
 "**Nessuno strumento qui rappresenta un ordine autorizzato.**","");
 return lines.join("\n");
}
