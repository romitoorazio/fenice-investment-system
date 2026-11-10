/** Public historical watchlist: explicitly unverified, not a PAPER or executable radar. */
export function buildPhase3UnattestedWatchlist({histories=[],nowIso=new Date().toISOString()}={}){
 const now=Date.parse(nowIso);
 if(!Array.isArray(histories)||!Number.isFinite(now))throw Error("INVALID_WATCHLIST_INPUT");
 const candidates=[],rejected=[];
 for(const [index,h] of histories.entries()){
  const fail=reason=>rejected.push({index,reason});
  if(!h||h.synthetic!==false||h.provenanceVerified!==false||!Array.isArray(h.closes)||h.closes.length<21||typeof h.mic!=="string"||typeof h.instrumentId!=="string"||!h.instrumentId.startsWith(h.mic+":")){fail("INVALID_UNATTESTED_HISTORY");continue;}
  const points=h.closes.map(p=>({time:Date.parse(p?.observedAt??""),price:p?.close}));
  if(points.some(p=>!Number.isFinite(p.time)||p.time>now||typeof p.price!=="number"||!Number.isFinite(p.price)||p.price<=0)||points.some((p,i)=>i>0&&p.time<=points[i-1].time)){fail("INVALID_HISTORY_SEQUENCE");continue;}
  if(now-points.at(-1).time>5*86400000){fail("HISTORY_TOO_OLD");continue;}
  const last=points.at(-1).price;
  const momentum5dPct=100*(last/points.at(-6).price-1);
  const momentum20dPct=100*(last/points.at(-21).price-1);
  const returns=points.slice(-21).slice(1).map((p,i)=>Math.log(p.price/points.slice(-21)[i].price));
  const avg=returns.reduce((a,b)=>a+b,0)/returns.length;
  const volatility20dPct=100*Math.sqrt(returns.reduce((a,b)=>a+(b-avg)**2,0)/returns.length);
  if(!Number.isFinite(volatility20dPct)||volatility20dPct<=0){fail("INSUFFICIENT_VARIATION");continue;}
  const score=Number((.6*momentum5dPct+.4*momentum20dPct-.35*volatility20dPct).toFixed(4));
  candidates.push({mic:h.mic,instrumentId:h.instrumentId,symbol:h.symbol,observedAt:new Date(points.at(-1).time).toISOString(),momentum5dPct:Number(momentum5dPct.toFixed(4)),momentum20dPct:Number(momentum20dPct.toFixed(4)),volatility20dPct:Number(volatility20dPct.toFixed(4)),score,classification:"UNATTESTED_PUBLIC_RESEARCH_WATCHLIST",dataVerified:false,investmentRecommendation:false,executable:false});
 }
 candidates.sort((a,b)=>b.score-a.score||a.mic.localeCompare(b.mic)||a.instrumentId.localeCompare(b.instrumentId));
 return {mode:"UNATTESTED_PUBLIC_RESEARCH_WATCHLIST",liveTradingAllowed:false,paperFillAuthorized:false,realPaperCertified:false,ordersGenerated:0,candidates,rejected};
}
