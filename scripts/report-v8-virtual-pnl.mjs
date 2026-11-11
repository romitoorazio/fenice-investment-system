/**
 * Historical as-of virtual valuation of certified ENGINEERING observation samples.
 * A quote from yesterday is never advertised as live; no fabricated sell fills.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replayExecutionLabLedger } from "./run-paper-execution-lab.mjs";
import { replayV8Days } from "./run-v8-technical-evidence.mjs";
import { replayShadowExits } from "./run-v8-shadow-exits.mjs";

const ROOT=resolve(fileURLToPath(import.meta.url),"../..");
const r4=n=>Math.round((n+Number.EPSILON)*10000)/10000;
/**
 * Do not create a new data commit merely because a closed-market check ran
 * another minute later. Only quote/sample/exit content, freshness-state
 * transitions, gains, losses or independently sourced marks may update PnL.
 * The retained generatedAt/proofAgeMinutes refer to the last actual written
 * evaluation, and asOf/sourceDayHash remain authoritative quote metadata.
 */
function comparableReport(report){
  if(!report||typeof report!=="object"||!Array.isArray(report.rows))
    return null;
  const payload={...report};
  delete payload.generatedAt;
  payload.rows=report.rows.map(row=>{
    const substantive={...row};
    delete substantive.proofAgeMinutes;
    return substantive;
  });
  return payload;
}
export function shouldPublishV8VirtualPnL({previous,next}){
  if(!next||next.scope!=="V8_TECHNICAL_SIMULATED_ACCOUNTING_ONLY"
    ||next.certificationCredit!==0||next.phase9CertifiedClosedTrades!==0
    ||next.liveTradingAllowed!==false||next.brokerConnectivityAllowed!==false)
    throw Error("V8_PNL_PUBLICATION_UNSAFE_RESULT");
  const nextAt=Date.parse(next.generatedAt);
  const prevAt=Date.parse(previous?.generatedAt);
  if(!Number.isFinite(nextAt))throw Error("V8_PNL_PUBLICATION_CLOCK_INVALID");
  if(previous&&Number.isFinite(prevAt)&&prevAt>nextAt)
    throw Error("V8_PNL_PUBLICATION_CLOCK_REGRESSION");
  if(!previous)return true;
  if(previous.liveTradingAllowed!==false||previous.brokerConnectivityAllowed!==false)
    throw Error("V8_PNL_PRIOR_REPORT_SAFETY_TAMPER");
  return JSON.stringify(comparableReport(previous))
    !==JSON.stringify(comparableReport(next));
}

export function reportV8VirtualPnL({approval,samples,days,exits,nowIso}) {
  const replay=replayExecutionLabLedger(samples);
  const d=replayV8Days(days,approval);
  const e=replayShadowExits({ledger:exits,samples,days,approval});
  const now=Date.parse(nowIso);
  if (!replay.valid||!d.valid||!e.valid||!Number.isFinite(now)
    || approval.liveTradingAllowed!==false||approval.brokerConnectivityAllowed!==false)
    throw Error("V8_VIRTUAL_PNL_INPUT_OR_SOURCE_TAMPER");
  const closed=new Set(exits.events.map(x=>x.entryEventId));
  const rows=samples.events.map(sample=>{
    const exit=exits.events.find(x=>x.entryEventId===sample.id);
    const spent=r4(sample.notionalEuro+sample.feeEuro);
    if (exit) return {
      entryId:sample.id,symbol:sample.symbol,state:"CLOSED_TECHNICAL_SIMULATION",
      enteredAt:sample.occurredAt,exitedAt:exit.closedAt,
      quantity:sample.quantity,entryCostEuro:spent,exitNetEuro:r4(exit.exitGrossEuro-exit.exitFeeEuro),
      realizedPnLEuro:exit.realizedPnLEuro,unrealizedPnLEuro:null,
      paperExecutionOnly:true,certificationCredit:0,
    };
    const source=[...days.records].reverse().find(day=>
      Date.parse(day.proof?.capturedAt)>=Date.parse(sample.occurredAt)
      && day.proof?.instruments.some(i=>i.symbol===sample.symbol));
    if (!source) return {
      entryId:sample.id,symbol:sample.symbol,state:"UNPRICED_TECHNICAL_SAMPLE",
      enteredAt:sample.occurredAt,quantity:sample.quantity,
      entryCostEuro:spent,realizedPnLEuro:null,unrealizedPnLEuro:null,
      paperExecutionOnly:true,certificationCredit:0,
    };
    const mid=source.proof.instruments.find(i=>i.symbol===sample.symbol).medianPrice;
    const fx=source.proof.fx.rate;
    const hypotheticalSellEuro=r4(sample.quantity*r4(mid*fx*(1-0.0005))-1);
    return {
      entryId:sample.id,symbol:sample.symbol,state:"OPEN_MARKED_AS_OF_HISTORICAL_PROOF",
      enteredAt:sample.occurredAt,quantity:sample.quantity,entryCostEuro:spent,
      hypotheticalSellNetEuro:hypotheticalSellEuro,
      asOf:source.proof.capturedAt,sourceDayHash:source.hash,
      proofAgeMinutes:Math.round((now-Date.parse(source.proof.capturedAt))/60000),
      isFreshNow:now>=Date.parse(source.proof.capturedAt)
        &&now-Date.parse(source.proof.capturedAt)<=120000,
      realizedPnLEuro:null,unrealizedPnLEuro:r4(hypotheticalSellEuro-spent),
      paperExecutionOnly:true,certificationCredit:0,
    };
  });
  const sum=key=>r4(rows.reduce((n,row)=>n+(Number.isFinite(row[key])?row[key]:0),0));
  const unpriced=rows.filter(r=>r.state==="UNPRICED_TECHNICAL_SAMPLE").length;
  return {
    version:1,generatedAt:nowIso,scope:"V8_TECHNICAL_SIMULATED_ACCOUNTING_ONLY",
    quotePolicy:"V8 dual independent PAPER-source observations, EUR FX, 5 bps exit slippage, EUR 1 exit fee",
    sampleBuys:rows.length,closedTechnicalRoundtrips:e.closedTechnicalRoundtrips,
    openMarkedSamples:rows.filter(x=>x.state==="OPEN_MARKED_AS_OF_HISTORICAL_PROOF").length,
    unpricedSamples:unpriced,realizedNetEuro:sum("realizedPnLEuro"),
    unrealizedNetEuro:unpriced===0?sum("unrealizedPnLEuro"):null,
    completeOpenValuation:unpriced===0,allMarksCurrent:rows.filter(x=>x.state==="OPEN_MARKED_AS_OF_HISTORICAL_PROOF").every(x=>x.isFreshNow),
    gainCount:rows.filter(x=>Number.isFinite(x.realizedPnLEuro)?x.realizedPnLEuro>0: Number.isFinite(x.unrealizedPnLEuro)&&x.unrealizedPnLEuro>0).length,
    lossCount:rows.filter(x=>Number.isFinite(x.realizedPnLEuro)?x.realizedPnLEuro<0: Number.isFinite(x.unrealizedPnLEuro)&&x.unrealizedPnLEuro<0).length,
    rows,
    certificationCredit:0,phase9CertifiedClosedTrades:0,
    historicalBackfill:false,investmentSignalQualityCertified:false,
    liveTradingAllowed:false,brokerConnectivityAllowed:false,
  };
}
async function main(){
  const read=n=>JSON.parse(readFileSync(resolve(ROOT,"data",n),"utf8"));
  const result=reportV8VirtualPnL({
    approval:read("paper-v8-technical-approval.json"),
    samples:read("paper-v8-technical-samples.json"),
    days:read("paper-v8-technical-days.json"),
    exits:read("paper-v8-shadow-exits.json"),
    nowIso:new Date().toISOString(),
  });
  const path=resolve(ROOT,"data","paper-v8-pnl-report.json");
  let previous=null;
  try{previous=JSON.parse(readFileSync(path,"utf8"))}catch(error){
    // A corrupted existing result is evidence of a problem, not a reason to
    // silently erase it. Only a genuinely missing report can be created.
    if(error?.code!=="ENOENT")throw error;
  }
  const published=shouldPublishV8VirtualPnL({previous,next:result});
  if(published)writeFileSync(path,JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log("FENICE virtual EUR PnL: "+JSON.stringify({
    published,reason:published?"SOURCE_OR_FRESHNESS_STATE_CHANGED":"NO_SUBSTANTIVE_CHANGE",
    sampleBuys:result.sampleBuys,closedTechnicalRoundtrips:result.closedTechnicalRoundtrips,
    realizedEuro:result.realizedNetEuro,unrealizedEuro:result.unrealizedNetEuro,
    allMarksCurrent:result.allMarksCurrent,unpriced:result.unpricedSamples,
    phase9Credit:0,liveTradingAllowed:false,
  }));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
