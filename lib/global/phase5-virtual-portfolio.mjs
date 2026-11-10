/** FENICE Phase 5 deterministic research-only virtual portfolio. No broker I/O. */
export function simulatePhase5Portfolio({histories=[],initialCashEuro=1000,allocationPct=10,feeEuro=1,exitSessions=5,maxPositions=3,mode="FORWARD_PENDING"}={}){
 if(!Array.isArray(histories)||!Number.isFinite(initialCashEuro)||initialCashEuro<=0||!Number.isFinite(allocationPct)||allocationPct<=0||allocationPct>100||!Number.isFinite(feeEuro)||feeEuro<0||!Number.isInteger(exitSessions)||exitSessions<1||exitSessions>40||!Number.isInteger(maxPositions)||maxPositions<1||maxPositions>20||!["FORWARD_PENDING","HISTORICAL_BACKTEST"].includes(mode))throw Error("INVALID_PHASE5_POLICY");
 const eligible=histories.map((h,index)=>{
  if(!h||h.synthetic!==false||h.provenanceVerified!==false||!Array.isArray(h.closes)||h.closes.length<21||typeof h.mic!=="string"||typeof h.instrumentId!=="string"||h.currency!=="EUR")return null;
  const points=h.closes.map(x=>({at:Date.parse(x.observedAt),price:x.close}));
  if(points.some((x,i)=>!Number.isFinite(x.at)||!Number.isFinite(x.price)||x.price<=0||(i>0&&x.at<=points[i-1].at)))return null;
  return {index,mic:h.mic,instrumentId:h.instrumentId,points};
 }).filter(Boolean);
 // One common observation cut-off, no look-ahead: each venue only uses closes at/before the cut-off.
 const cutoffs=eligible.map(x=>x.points.at(-1).at).sort((a,b)=>a-b);
 const latestCommon=cutoffs.length?cutoffs[0]:null;
 const cutoff=mode==="HISTORICAL_BACKTEST"&&latestCommon!==null?Math.min(...eligible.map(x=>{const i=x.points.findLastIndex(p=>p.at<=latestCommon);return i>=exitSessions?x.points[i-exitSessions].at:Infinity})):latestCommon;
 const picks=eligible.map(x=>{
  const available=x.points.filter(p=>p.at<=cutoff);
  if(available.length<21)return null;
  const i=available.length-1;
  const score=.6*100*(available[i].price/available[i-5].price-1)+.4*100*(available[i].price/available[i-20].price-1);
  return {...x,entryIndex:x.points.findIndex(p=>p.at===available[i].at),score};
 }).filter(x=>x&&x.score>0).sort((a,b)=>b.score-a.score||a.instrumentId.localeCompare(b.instrumentId)).slice(0,maxPositions);
 let cash=initialCashEuro;const trades=[],pending=[];
 for(const x of picks){
  const entry=x.points[x.entryIndex],exit=x.points[x.entryIndex+exitSessions];
  if(!exit){pending.push({mic:x.mic,instrumentId:x.instrumentId,entryAt:new Date(entry.at).toISOString(),reason:"EXIT_NOT_YET_OBSERVED"});continue;}
  const budget=Math.min(initialCashEuro*allocationPct/100,cash);
  const quantity=Math.floor((budget-feeEuro)/entry.price*1000000)/1000000;
  if(quantity<=0)continue;
  const entryCost=quantity*entry.price+feeEuro,exitProceeds=quantity*exit.price-feeEuro;
  cash-=entryCost;cash+=exitProceeds;
  trades.push({mic:x.mic,instrumentId:x.instrumentId,entryAt:new Date(entry.at).toISOString(),exitAt:new Date(exit.at).toISOString(),quantity,entryPrice:entry.price,exitPrice:exit.price,netPnlEuro:Number((exitProceeds-entryCost).toFixed(4)),classification:"HISTORICAL_SIMULATION_NOT_LIVE_FILL"});
 }
 const pnl=trades.reduce((sum,t)=>sum+t.netPnlEuro,0);
 return {mode:mode==="HISTORICAL_BACKTEST"?"PHASE5_HISTORICAL_VIRTUAL_PORTFOLIO_NOT_LIVE":"PHASE5_FORWARD_PENDING_RESEARCH_NOT_LIVE",initialCashEuro,endingCashEuro:Number(cash.toFixed(4)),netPnlEuro:Number(pnl.toFixed(4)),trades,pending,assumptions:{allocationPct,feeEuro,exitSessions,maxPositions,commonCutoff:cutoff?new Date(cutoff).toISOString():null,fxConversion:"EUR_ONLY_NON_EUR_EXCLUDED",fees:"FLAT_SIMULATED",lookAheadProtection:"COMMON_CUTOFF"},realPaperCertified:false,liveTradingAllowed:false,ordersGenerated:0};
}
