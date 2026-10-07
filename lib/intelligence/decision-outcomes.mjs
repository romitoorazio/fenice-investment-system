const DAY_MS = 86400000;
const DECISIONS = new Set(["COMPRA","OSSERVA","ATTENDI","EVITA"]);
const finite = (v) => Number.isFinite(Number(v));
const round = (v,d=2) => finite(v) ? Math.round(Number(v)*10**d)/10**d : null;
const norm = (v) => String(v||"").trim().toUpperCase();

export function classifyDecisionOutcome(decision, returnPercent, neutralBandPercent=1) {
  if (!finite(returnPercent)) return null;
  const d=norm(decision), r=Number(returnPercent), band=Math.max(0,Number(neutralBandPercent)||0);
  if (d==="COMPRA") return {class:r>0?"FAVOREVOLE":"SFAVOREVOLE",favorable:r>0,missedUpsidePercent:0,avoidedLossPercent:0};
  if (d==="EVITA") return {class:r<=0?"FAVOREVOLE":"SFAVOREVOLE",favorable:r<=0,missedUpsidePercent:r>0?round(r):0,avoidedLossPercent:r<0?round(-r):0};
  if (d==="OSSERVA"||d==="ATTENDI") {
    const missed=r>band?round(r):0, avoided=r<-band?round(-r):0;
    return {class:missed?"OPPORTUNITA_PERSA":avoided?"PERDITA_EVITATA":"NEUTRALE",favorable:null,missedUpsidePercent:missed,avoidedLossPercent:avoided};
  }
  return {class:"NON_CLASSIFICATO",favorable:null,missedUpsidePercent:0,avoidedLossPercent:0};
}

export function selectDecisionOutcomeCandidates(decisions,{limit=200}={}) {
  return (Array.isArray(decisions)?decisions:[])
    .filter(x=>DECISIONS.has(norm(x?.decision))&&String(x?.symbol||"").trim()&&finite(x?.currentPrice)&&Number(x.currentPrice)>0)
    .slice(0,Math.max(0,Math.min(500,Number(limit)||0)))
    .map(x=>({
      symbol:String(x.symbol).toUpperCase(),name:x.name||null,decision:norm(x.decision),terminalDecision:norm(x.terminalDecision),
      committeeScore:finite(x.committeeScore)?Number(x.committeeScore):null,
      confidence:finite(x.confidence)?Number(x.confidence):null,
      rawConfidence:finite(x.rawConfidenceBeforeCalibration)?Number(x.rawConfidenceBeforeCalibration):null,
      riskScore:finite(x.riskScore)?Number(x.riskScore):null,
      referencePrice:Number(x.currentPrice),currency:x.currency||null,assetClass:x.assetClass||null,sector:x.sector||null,
      researchOnly:true,executionEligible:false,paperCertificationEligible:false,brokerSubmissionAllowed:false,liveTradingAllowed:false
    }));
}

function payload(record,price,measuredAt,source) {
  const r=((Number(price)-Number(record.referencePrice))/Number(record.referencePrice))*100;
  return {measuredAt,price:round(price),returnPercent:round(r),source,outcome:classifyDecisionOutcome(record.decision,r)};
}
function ageDays(createdAt,now){const t=Date.parse(String(createdAt||""));return Number.isFinite(t)?Math.max(0,(now.getTime()-t)/DAY_MS):0;}
function addCheckpoint(record,label,days,price,now,maxDelay=4){
  if(record.checkpoints?.[label]||ageDays(record.createdAt,now)<days||ageDays(record.createdAt,now)>days+maxDelay||!finite(price))return;
  record.checkpoints??={}; record.checkpoints[label]=payload(record,price,now.toISOString(),"current-committee");
}
function dailyHistory(snapshots){
  const m=new Map();
  for(const s of Array.isArray(snapshots)?snapshots:[]){const g=String(s?.generatedAt||""),t=Date.parse(g);if(!Number.isFinite(t))continue;const wd=new Date(t).getUTCDay();if(wd===0||wd===6)continue;const d=g.slice(0,10),old=m.get(d);if(!old||t>old.t)m.set(d,{s,t,d});}
  return [...m.values()].sort((a,b)=>a.t-b.t);
}
function priceAt(snapshot,symbol){const x=(Array.isArray(snapshot?.allDecisions)?snapshot.allDecisions:[]).find(v=>norm(v?.symbol)===norm(symbol));return finite(x?.currentPrice)&&Number(x.currentPrice)>0?Number(x.currentPrice):null;}
function historicalCheckpoint(record,days,history,maxDelay){
  const origin=Date.parse(record.createdAt),target=origin+days*DAY_MS,latest=target+maxDelay*DAY_MS;
  for(const row of history){if(row.t<target)continue;if(row.t>latest)break;const p=priceAt(row.s,record.symbol);if(finite(p))return payload(record,p,row.s.generatedAt,"committee-history");}
  return null;
}

export function buildHistoricalDecisionOutcomeBackfill(snapshots,{maxRecords=20000,maxCheckpointDelayDays=4}={}) {
  const h=dailyHistory(snapshots),records=[];
  for(const row of h) for(const c of selectDecisionOutcomeCandidates(row.s?.allDecisions||[])) records.push({
    id:`${row.d}:${c.symbol}:${c.decision}`,cycleId:row.s.generatedAt,observationDate:row.d,createdAt:row.s.generatedAt,marketRegime:row.s?.marketRegime||null,...c,
    referencePrice:round(c.referencePrice),lastPrice:round(c.referencePrice),lastMarkedAt:row.s.generatedAt,markToMarketPercent:0,checkpoints:{},historicalBackfill:true,historicalSource:"data/committee-history"
  });
  for(const r of records) for(const [label,days] of [["1d",1],["7d",7],["30d",30],["90d",90]]){const cp=historicalCheckpoint(r,days,h,maxCheckpointDelayDays);if(cp)r.checkpoints[label]=cp;}
  const capped=records.sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.symbol.localeCompare(b.symbol)).slice(-Math.max(1,Math.min(50000,Number(maxRecords)||20000)));
  return {version:1,generatedAt:new Date().toISOString(),purpose:"V7 research-only decision outcome bootstrap.",isolation:{modifiesV6DecisionLedger:false,executionEligible:false,paperCertificationEligible:false,brokerSubmissionAllowed:false,liveTradingAllowed:false},recordCount:capped.length,records:capped};
}

export function updateDecisionOutcomeLedger(previous,candidates,priceBySymbol,{cycleId,marketRegime=null,now=new Date(),maxRecords=20000}={}) {
  const records=structuredClone(Array.isArray(previous?.records)?previous.records:[]),prices=priceBySymbol instanceof Map?priceBySymbol:new Map(),ts=now.toISOString();
  for(const r of records){const p=prices.get(norm(r.symbol));if(!finite(p))continue;r.lastPrice=round(p);r.lastMarkedAt=ts;r.markToMarketPercent=round(((Number(p)-Number(r.referencePrice))/Number(r.referencePrice))*100);for(const [label,days] of [["1d",1],["7d",7],["30d",30],["90d",90]])addCheckpoint(r,label,days,p,now);}
  const date=ts.slice(0,10),existing=new Set(records.map(r=>String(r.id||"")));
  for(const c of Array.isArray(candidates)?candidates:[]){const id=`${date}:${c.symbol}:${c.decision}`;if(existing.has(id))continue;records.push({id,cycleId:cycleId||ts,observationDate:date,createdAt:ts,marketRegime,...c,referencePrice:round(c.referencePrice),lastPrice:round(c.referencePrice),lastMarkedAt:ts,markToMarketPercent:0,checkpoints:{},historicalBackfill:false});existing.add(id);}
  const capped=records.slice(-Math.max(1,Math.min(50000,Number(maxRecords)||20000)));
  return {version:1,generatedAt:ts,purpose:"V7 research-only longitudinal decision outcome ledger. Never consumed as V6 PAPER evidence.",isolation:{modifiesV6DecisionLedger:false,executionEligible:false,paperCertificationEligible:false,brokerSubmissionAllowed:false,liveTradingAllowed:false},recordCount:capped.length,records:capped};
}

export function classifyRestraintBias({ sampleSize = 0, missedUpsidePercent = 0, avoidedLossPercent = 0 } = {}, thresholdPerDecisionPercent = 0.25) {
  const n = Math.max(0, Number(sampleSize) || 0);
  if (n < 10) return "INSUFFICIENT";
  const netPerDecision = (Number(avoidedLossPercent || 0) - Number(missedUpsidePercent || 0)) / n;
  const threshold = Math.max(0, Number(thresholdPerDecisionPercent) || 0);
  if (netPerDecision <= -threshold) return "TOO_CAUTIOUS";
  if (netPerDecision >= threshold) return "PROTECTION_VALUE";
  return "BALANCED";
}

export function summarizeDecisionOutcomes(records,checkpoint) {
  const rows=(Array.isArray(records)?records:[]).filter(r=>finite(r?.checkpoints?.[checkpoint]?.returnPercent)),decisions={};
  for(const d of ["COMPRA","OSSERVA","ATTENDI","EVITA"]){
    const selected=rows.filter(r=>norm(r.decision)===d),returns=selected.map(r=>Number(r.checkpoints[checkpoint].returnPercent)),outcomes=selected.map(r=>r.checkpoints[checkpoint].outcome||classifyDecisionOutcome(d,r.checkpoints[checkpoint].returnPercent)),directional=outcomes.filter(o=>typeof o?.favorable==="boolean");
    decisions[d]={sampleSize:selected.length,averageReturnPercent:selected.length?round(returns.reduce((a,b)=>a+b,0)/selected.length):null,favorableRatePercent:directional.length?round(directional.filter(o=>o.favorable).length/directional.length*100):null,missedUpsidePercent:round(outcomes.reduce((s,o)=>s+Number(o?.missedUpsidePercent||0),0)),avoidedLossPercent:round(outcomes.reduce((s,o)=>s+Number(o?.avoidedLossPercent||0),0))};
  }
  const waits=rows.filter(r=>["OSSERVA","ATTENDI"].includes(norm(r.decision)));
  const wo=waits.map(r=>r.checkpoints[checkpoint].outcome||classifyDecisionOutcome(r.decision,r.checkpoints[checkpoint].returnPercent));
  const missed=wo.reduce((s,o)=>s+Number(o?.missedUpsidePercent||0),0);
  const avoided=wo.reduce((s,o)=>s+Number(o?.avoidedLossPercent||0),0);
  const tradeoff={
    sampleSize:waits.length,
    missedUpsidePercent:round(missed),
    avoidedLossPercent:round(avoided),
    netProtectionMinusMissedPercent:round(avoided-missed),
    missedUpsidePerDecisionPercent:waits.length?round(missed/waits.length):null,
    avoidedLossPerDecisionPercent:waits.length?round(avoided/waits.length):null,
    netProtectionMinusMissedPerDecisionPercent:waits.length?round((avoided-missed)/waits.length):null,
  };
  tradeoff.biasState=classifyRestraintBias(tradeoff);
  return {checkpoint,sampleSize:rows.length,decisions,restraintTradeoff:tradeoff};
}
