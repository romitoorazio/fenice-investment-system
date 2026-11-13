/** FENICE Phase 9: world forward research performance, no broker or executable PAPER. */
import {validatePhase5ForwardLedger} from "./phase5-forward-research.mjs";
import {lookupEcbHistoricalFx} from "./ecb-daily-fx-reference.mjs";
export const PHASE9_MODE="PHASE9_WORLD_FORWARD_VALIDATION_RESEARCH_ONLY";
const fault=s=>{throw Error("PHASE9_INTEGRITY_"+s);};
const round=n=>Number(n.toFixed(4));
const date=s=>s.slice(0,10);
const epoch=s=>Date.parse(s);
function lastSettledAfterEntry(h,entryAt,nowIso){
 if(!h||h.synthetic!==false||h.provenanceVerified!==false||
  !/^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\//.test(h.sourceUrl??"")||
  !Array.isArray(h.closes))return null;
 let previous=-Infinity,mostRecent=null;
 for(const bar of h.closes){
  const time=epoch(bar?.observedAt);
  if(!Number.isFinite(time)||time<=previous||time>epoch(nowIso)||
   !Number.isFinite(bar?.close)||bar.close<=0)return null;
  previous=time;
  if(time>epoch(entryAt)&&date(bar.observedAt)<date(nowIso))mostRecent=bar;
 }
 return mostRecent;
}
export function buildPhase9Report({forwardLedger,forwardPortfolio,phase8,histories=[],
 fxReference=null,independentExecutableEvidence=[],nowIso=new Date().toISOString()}={}){
 if(!Number.isFinite(epoch(nowIso))||!Array.isArray(histories)||
  !Array.isArray(independentExecutableEvidence))fault("INPUT");
 // Submitted quote samples are not independently verifiable without a trusted data adapter.
 if(independentExecutableEvidence.length!==0)fault("UNVERIFIED_EXECUTABLE_EVIDENCE");
 const state=validatePhase5ForwardLedger(forwardLedger,nowIso).accounting;
 if(!phase8||!forwardPortfolio||phase8.mode!=="PHASE8_EVIDENCE_AUDIT_RESEARCH_ONLY"||
  phase8.engineeringAudit!=="PASS"||phase8.certification!=="NOT_CERTIFIED"||
  phase8.eligibleForRealOrders!==false||phase8.eligibleForCertifiedPaper!==false||
  phase8.lineage?.forwardHash!==forwardLedger.headHash||
  forwardPortfolio.ledgerHeadHash!==forwardLedger.headHash||
  forwardPortfolio.mode!=="PHASE5_FORWARD_UNATTESTED_VIRTUAL_RESEARCH"||
  forwardPortfolio.realPaperCertified!==false||forwardPortfolio.paperFillAuthorized!==false||
  forwardPortfolio.liveTradingAllowed!==false||forwardPortfolio.ordersGenerated!==0||
  state.cashEuro!==forwardPortfolio.cashEuro||
  state.realizedNetPnlEuro!==forwardPortfolio.realizedNetPnlEuro||
  state.closedTrades!==forwardPortfolio.closedTrades||
  state.wins!==forwardPortfolio.wins||state.losses!==forwardPortfolio.losses||
  state.openPositions.length!==forwardPortfolio.openPositions?.length||
  phase8.measurements?.forwardClosed!==state.closedTrades||
  phase8.measurements?.forwardNetEuro!==state.realizedNetPnlEuro||
  phase8.measurements?.forwardWins!==state.wins||phase8.measurements?.forwardLosses!==state.losses||
  phase8.measurements?.forwardOpened!==state.openPositions.length)
  fault("RECONCILIATION");
 if(!Number.isFinite(epoch(phase8.generatedAt))||epoch(phase8.generatedAt)>epoch(nowIso)||
   !Number.isFinite(epoch(forwardPortfolio.generatedAt))||
   epoch(forwardPortfolio.generatedAt)>epoch(nowIso))fault("CLOCK");
 const map=new Map();
 for(const h of histories){
  if(map.has(h?.instrumentId))fault("DUPLICATE_INSTRUMENT_HISTORY");
  map.set(h?.instrumentId,h);
 }
 const marks=[],missing=[];
 for(const pos of state.openPositions){
  const h=map.get(pos.instrumentId);
  if(!h||h.mic!==pos.mic||h.currency!==pos.currency){
   missing.push({instrumentId:pos.instrumentId,reason:"NO_VALID_HISTORY"});continue;
  }
  const bar=lastSettledAfterEntry(h,pos.barAt,nowIso);
  if(!bar){missing.push({instrumentId:pos.instrumentId,reason:"NO_LATER_SETTLED_DAILY_CLOSE"});continue;}
  const age=(epoch(date(nowIso)+"T00:00:00Z")-epoch(date(bar.observedAt)+"T00:00:00Z"))/86400000;
  if(age>5){missing.push({instrumentId:pos.instrumentId,reason:"STALE_SETTLED_DAILY_CLOSE"});continue;}
  const fx=lookupEcbHistoricalFx({series:fxReference,currency:pos.currency,at:bar.observedAt});
  if(!fx.ok){missing.push({instrumentId:pos.instrumentId,reason:fx.reason});continue;}
  const value=pos.quantity*bar.close*fx.rateToEur-forwardLedger.policy.feeEuro;
  if(!Number.isFinite(value)||value<0){missing.push({instrumentId:pos.instrumentId,reason:"INVALID_VALUATION"});continue;}
  marks.push({instrumentId:pos.instrumentId,mic:pos.mic,currency:pos.currency,
   entryAt:pos.barAt,markAt:bar.observedAt,closeLocal:bar.close,quantity:pos.quantity,
   indicativeExitEuro:round(value),netUnrealizedEuro:round(value-pos.entryCostEuro),
   fxReferenceDate:fx.referenceDate,paperQuoteCertified:false,
   classification:"SETTLED_PUBLIC_DAILY_CLOSE_NON_EXECUTABLE"});
 }
 const complete=missing.length===0;
 const proceeds=round(marks.reduce((s,p)=>s+p.indicativeExitEuro,0));
 const unrealized=round(marks.reduce((s,p)=>s+p.netUnrealizedEuro,0));
 const equity=complete?round(state.cashEuro+proceeds):null;
 const closeRows=forwardLedger.entries.filter(r=>r.event.type==="CLOSE").map(r=>r.event);
 const profit=round(closeRows.filter(e=>e.netPnlEuro>0).reduce((s,e)=>s+e.netPnlEuro,0));
 const lossAbs=round(-closeRows.filter(e=>e.netPnlEuro<0).reduce((s,e)=>s+e.netPnlEuro,0));
 const closedVenues=new Set(closeRows.map(x=>x.mic)),closedDates=new Set(closeRows.map(x=>date(x.barAt)));
 const progress={closed:state.closedTrades,requiredClosed:10,wins:state.wins,requiredWins:1,
  losses:state.losses,requiredLosses:1,closedVenues:closedVenues.size,requiredVenues:3,
  distinctExitDates:closedDates.size,requiredExitDates:3,
  independentExecutableFamilies:0,requiredIndependentExecutableFamilies:2};
 const sampleComplete=progress.closed>=10&&progress.wins>=1&&progress.losses>=1&&
  progress.closedVenues>=3&&progress.distinctExitDates>=3;
 const blockers=[];
 if(!sampleComplete)blockers.push("FORWARD_RESULTS_SAMPLE_NOT_MATURE");
 if(!complete)blockers.push("SOME_OPEN_POSITIONS_NOT_MARKABLE");
 blockers.push("NO_TWO_INDEPENDENT_EXECUTABLE_PRICE_SOURCES");
 return {schemaVersion:1,mode:PHASE9_MODE,generatedAt:nowIso,
  operationalResearch:"ACTIVE",technicalValidation:"PASS",certification:"NOT_CERTIFIED",
  initialCapitalEuro:forwardLedger.policy.initialCashEuro,
  realized:{closed:state.closedTrades,wins:state.wins,losses:state.losses,flat:state.flat,
   netEuro:state.realizedNetPnlEuro,grossGainsEuro:profit,grossLossesEuro:lossAbs,
   profitFactor:lossAbs>0?round(profit/lossAbs):null,winRatePct:state.winRatePct,
   closedMarkets:closedVenues.size,distinctExitDates:closedDates.size},
  open:{count:state.openPositions.length,marks,missing,complete,
   netUnrealizedEuro:complete?unrealized:null},
  portfolio:{cashEuro:state.cashEuro,indicativeOpenValueEuro:complete?proceeds:null,
   indicativeEquityEuro:equity,
   indicativeTotalNetEuro:equity===null?null:round(equity-forwardLedger.policy.initialCashEuro)},
  requirements:progress,blockers,sourceStatus:{independentExecutableFamilies:0,
   yahooDailyCloseOnly:true,ecbFxIndicativeOnly:true},
  lineage:{forwardHeadHash:forwardLedger.headHash,phase8GeneratedAt:phase8.generatedAt},
  limits:{maxOpenPositions:forwardLedger.policy.maxPositions,
   feePerSideEuro:forwardLedger.policy.feeEuro,risk:forwardPortfolio.riskState?.riskState},
  realPaperCertified:false,certifiedPaper:false,eligibleForRealOrders:false,
  liveTradingAllowed:false,ordersGenerated:0,brokerContacted:false,
  disclaimer:"Research-only settled close accounting, not executable quotes or Directa fills."};
}
export function formatPhase9Report(a){
 if(a?.mode!==PHASE9_MODE||a.certification!=="NOT_CERTIFIED"||
  a.ordersGenerated!==0||a.liveTradingAllowed!==false)fault("FORMAT");
 const euro=n=>n===null?"N/D":(n<0?"−":"")+"€"+Math.abs(n).toFixed(2).replace(".",",");
 const r=a.realized,o=a.open,p=a.portfolio,q=a.requirements;
 const lines=["# FENICE ONE GLOBAL — Fase 9: controllo operativo forward","",
  "**Aggiornato:** "+a.generatedAt+" · **PAPER certificato: NO** · **Ordini Directa: 0**","",
  "## Risultati forward (non storici)","- Operazioni virtuali chiuse: "+r.closed+
   ", positive: "+r.wins+", negative: "+r.losses+", pari: "+r.flat,
  "- Guadagno/perdita forward realizzato: **"+euro(r.netEuro)+"**",
  "- Profit factor: "+(r.profitFactor===null?"non significativo":r.profitFactor.toFixed(4)),
  "","## Posizioni virtuali aperte",
  "- Aperte: "+o.count+"; valorizzate su prezzi giornalieri conclusi: "+o.marks.length+
   "; non valorizzabili: "+o.missing.length,
  "- Liquidità virtuale: "+euro(p.cashEuro),
  "- Equity virtuale indicativa (commissione ipotetica di chiusura compresa): "+euro(p.indicativeEquityEuro),
  "- Risultato virtuale totale indicativo: "+euro(p.indicativeTotalNetEuro),
  "","## Progressi verso la certificazione",
  "- Chiusure forward: "+q.closed+"/"+q.requiredClosed,
  "- Mercati chiusi: "+q.closedVenues+"/"+q.requiredVenues,
  "- Date di chiusura: "+q.distinctExitDates+"/"+q.requiredExitDates,
  "- Fonti prezzi eseguibili indipendenti: 0/2. Yahoo e BCE non sono quotazioni eseguibili.",
  "","## Requisiti mancanti"];
 for(const b of a.blockers)lines.push("- "+b);
 lines.push("","## Integrità e protezione",
  "- Ledger forward SHA-256: "+a.lineage.forwardHeadHash,
  "- Stato rischio: "+a.limits.risk,
  "- Nessun ordine Directa.","",
  "**Monitoraggio operativo della Fase 9 disponibile; certificazione finanziaria ancora mancante.**","");
 return lines.join("\n");
}
