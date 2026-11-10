/** Observed historical close-to-close walk-forward, not live signals or PAPER fills. */
export function buildPhase4HistoricalWalkForward({histories=[],horizons=[2,5,10],lookback=20}={}){
 if(!Array.isArray(histories)||!Array.isArray(horizons)||horizons.some(h=>!Number.isInteger(h)||h<1||h>40)||lookback<20)throw Error("INVALID_WALKFORWARD_POLICY");
 const byHorizon=horizons.map(sessions=>({sessions,positive:0,negative:0,flat:0,observations:0,sumReturnPct:0}));
 const rejected=[];
 for(const [index,h] of histories.entries()){
  if(!h||h.synthetic!==false||h.provenanceVerified!==false||!Array.isArray(h.closes)||h.closes.length<lookback+2){rejected.push({index,reason:"INSUFFICIENT_PUBLIC_HISTORY"});continue;}
  const p=h.closes.map(x=>({t:Date.parse(x.observedAt),v:x.close}));
  if(p.some(x=>!Number.isFinite(x.t)||!Number.isFinite(x.v)||x.v<=0)||p.some((x,i)=>i>0&&x.t<=p[i-1].t)){rejected.push({index,reason:"INVALID_HISTORY"});continue;}
  for(let i=lookback;i<p.length;i++){
   const momentum5=100*(p[i].v/p[i-5].v-1);
   const momentum20=100*(p[i].v/p[i-20].v-1);
   const returns=Array.from({length:20},(_,k)=>Math.log(p[i-19+k].v/p[i-20+k].v));
   const avg=returns.reduce((a,b)=>a+b,0)/20;
   const vol=100*Math.sqrt(returns.reduce((a,b)=>a+(b-avg)**2,0)/20);
   const score=.6*momentum5+.4*momentum20-.35*vol;
   if(!Number.isFinite(score)||score<=0)continue;
   for(const stat of byHorizon){
    if(i+stat.sessions>=p.length)continue;
    const result=100*(p[i+stat.sessions].v/p[i].v-1);
    stat.observations++;stat.sumReturnPct+=result;
    if(result>0)stat.positive++;else if(result<0)stat.negative++;else stat.flat++;
   }
  }
 }
 return {mode:"HISTORICAL_WALK_FORWARD_BACKTEST_NOT_LIVE",realHistoricalCloses:true,independentAttestation:false,feesAndFxExcluded:true,overlappingSignals:true,realPaperCertified:false,ordersGenerated:0,results:byHorizon.map(({sumReturnPct,...s})=>({...s,meanReturnPct:s.observations?Number((sumReturnPct/s.observations).toFixed(4)):null})),rejected};
}
