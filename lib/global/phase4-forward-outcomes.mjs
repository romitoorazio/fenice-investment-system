/** Phase 4: immutable-signal forward outcome evaluation, research only. */
export function evaluatePhase4ForwardOutcomes({signals=[],histories=[],nowIso=new Date().toISOString(),horizons=[2,5,10,40]}={}){
 const now=Date.parse(nowIso);
 if(!Number.isFinite(now)||!Array.isArray(signals)||!Array.isArray(histories)||!Array.isArray(horizons)||horizons.some(h=>!Number.isSafeInteger(h)||h<1||h>60))throw Error("INVALID_PHASE4_POLICY");
 const byKey=new Map(histories.map(h=>[`${h.mic}:${h.instrumentId}`,h]));
 const outcomes=[],rejected=[];
 for(const [index,s] of signals.entries()){
  const fail=reason=>rejected.push({index,reason});
  if(!s||typeof s.mic!=="string"||typeof s.instrumentId!=="string"||typeof s.observedAt!=="string"||typeof s.score!=="number"||!Number.isFinite(s.score)||s.dataVerified!==false||s.executable!==false){fail("INVALID_RESEARCH_SIGNAL");continue;}
  const signalTime=Date.parse(s.observedAt);
  if(!Number.isFinite(signalTime)||signalTime>now){fail("INVALID_SIGNAL_TIME");continue;}
  const h=byKey.get(`${s.mic}:${s.instrumentId}`);
  if(!h||h.synthetic!==false||h.provenanceVerified!==false||!Array.isArray(h.closes)){fail("MISSING_UNATTESTED_HISTORY");continue;}
  const points=h.closes.map(p=>({time:Date.parse(p?.observedAt??""),price:p?.close}));
  if(points.some(p=>!Number.isFinite(p.time)||p.time>now||typeof p.price!=="number"||!Number.isFinite(p.price)||p.price<=0)||points.some((p,i)=>i>0&&p.time<=points[i-1].time)){fail("INVALID_HISTORY");continue;}
  const anchor=points.findIndex(p=>p.time===signalTime);
  if(anchor<0){fail("SIGNAL_PRICE_TIMESTAMP_NOT_FOUND");continue;}
  const entry=points[anchor].price;
  const results=horizons.map(days=>{
   const target=points[anchor+days];
   return {sessions:days,status:target?"OBSERVED":"PENDING",returnPct:target?Number((100*(target.price/entry-1)).toFixed(4)):null,observedAt:target?new Date(target.time).toISOString():null};
  });
  outcomes.push({mic:s.mic,instrumentId:s.instrumentId,signalAt:s.observedAt,score:s.score,referencePrice:entry,results,classification:"UNATTESTED_FORWARD_RESEARCH",realPaperCertified:false});
 }
 return {mode:"PHASE4_FORWARD_RESEARCH_ONLY",liveTradingAllowed:false,paperFillAuthorized:false,ordersGenerated:0,outcomes,rejected};
}
