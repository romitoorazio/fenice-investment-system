/** Aggregate only matured forward observations; pending horizons never count as wins. */
export function summarizePhase4ForwardOutcomes({outcomes=[],horizons=[2,5,10,40]}={}){
 if(!Array.isArray(outcomes)||!Array.isArray(horizons)||horizons.some(n=>!Number.isSafeInteger(n)||n<1))throw Error("INVALID_PHASE4_SUMMARY");
 const stats=horizons.map(sessions=>{
  const values=[];let pending=0;
  for(const outcome of outcomes){
   const result=outcome?.results?.find(x=>x.sessions===sessions);
   if(!result||result.status==="PENDING"){pending++;continue;}
   if(result.status!=="OBSERVED"||typeof result.returnPct!=="number"||!Number.isFinite(result.returnPct))throw Error("INVALID_PHASE4_OUTCOME");
   values.push(result.returnPct);
  }
  const observed=values.length,wins=values.filter(x=>x>0).length,losses=values.filter(x=>x<0).length,flat=observed-wins-losses;
  return {sessions,observed,pending,wins,losses,flat,winRatePct:observed?Number((100*wins/observed).toFixed(2)):null,meanReturnPct:observed?Number((values.reduce((a,b)=>a+b,0)/observed).toFixed(4)):null};
 });
 return {mode:"PHASE4_UNATTESTED_FORWARD_EVALUATION",researchOnly:true,feesAndFxExcluded:true,realPaperCertified:false,liveTradingAllowed:false,ordersGenerated:0,stats};
}
