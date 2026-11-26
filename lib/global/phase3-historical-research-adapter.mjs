/** Convert historical sourced closes into Phase 3 research metrics; never executable bid/ask. */
export function derivePhase3ResearchFromCloses({series=[],nowIso=new Date().toISOString(),fxToEur,stopDistancePct=8,estimatedSpreadPct=0.2}={}){
 const valid=x=>typeof x==="number"&&Number.isFinite(x);
 if(!Array.isArray(series)||!valid(fxToEur)||fxToEur<=0||!valid(stopDistancePct)||stopDistancePct<=0||stopDistancePct>=100||!valid(estimatedSpreadPct)||estimatedSpreadPct<0)throw Error("INVALID_HISTORICAL_RESEARCH_POLICY");
 const now=Date.parse(nowIso);
 if(!Number.isFinite(now))throw Error("INVALID_HISTORICAL_RESEARCH_CLOCK");
 const accepted=[],rejected=[];
 for(const [index,s] of series.entries()){
  const fail=reason=>rejected.push({index,reason});
  if(!s||typeof s.mic!=="string"||typeof s.instrumentId!=="string"||!Array.isArray(s.closes)||s.closes.length<21){fail("INSUFFICIENT_HISTORY");continue;}
  if(s.synthetic!==true&&!(s.provenanceVerified===true&&typeof s.sourceId==="string"&&s.sourceId.trim()&&typeof s.sourceUrl==="string"&&/^https:\/\//.test(s.sourceUrl))){fail("UNVERIFIED_HISTORY_SOURCE");continue;}
  const points=s.closes.map(p=>({time:Date.parse(p?.observedAt??""),close:p?.close}));
  if(points.some(p=>!Number.isFinite(p.time)||p.time>now||!valid(p.close)||p.close<=0)||points.some((p,i)=>i>0&&p.time<=points[i-1].time)){fail("INVALID_OR_UNSORTED_HISTORY");continue;}
  const last=points.at(-1);
  if(now-last.time>86400000){fail("STALE_HISTORY");continue;}
  const pct=(a,b)=>100*(a/b-1);
  const momentum5dPct=pct(last.close,points.at(-6).close);
  const momentum20dPct=pct(last.close,points.at(-21).close);
  const dailyReturns=points.slice(-21).map((p,i,arr)=>i===0?null:Math.log(p.close/arr[i-1].close)).slice(1);
  const mean=dailyReturns.reduce((a,b)=>a+b,0)/dailyReturns.length;
  const volatility20dPct=100*Math.sqrt(dailyReturns.reduce((a,b)=>a+(b-mean)**2,0)/dailyReturns.length);
  if(volatility20dPct<=0){fail("ZERO_HISTORICAL_VOLATILITY");continue;}
  accepted.push({mic:s.mic,instrumentId:s.instrumentId,observedAt:new Date(last.time).toISOString(),lastPrice:last.close,fxToEur,momentum5dPct,momentum20dPct,volatility20dPct,spreadPct:estimatedSpreadPct,stopDistancePct,synthetic:s.synthetic===true,provenanceVerified:s.synthetic!==true,sourceId:s.sourceId??null,sourceUrl:s.sourceUrl??null,spreadEstimateOnly:true,classification:"HISTORICAL_RESEARCH_NOT_EXECUTABLE"});
 }
 return {mode:"HISTORICAL_RESEARCH_ONLY",liveTradingAllowed:false,paperFillAuthorized:false,accepted,rejected};
}
