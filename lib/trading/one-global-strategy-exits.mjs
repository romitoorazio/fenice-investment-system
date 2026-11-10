/** ONE GLOBAL: separately approved virtual exit policy and isolated accounting.
 * No broker, provider, filesystem or network calls. The caller MUST pass a
 * ledger already replay-validated by runWorldPaperV7 and exact-venue evidence.
 * This file never certifies Phase 9 or financial profitability.
 */
import { createHash } from "node:crypto";
const DAY=86400000;
const nowTime=value=>{
  if(typeof value!=="string"||!/^(?:\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return null;
  const ms=Date.parse(value);
  return Number.isFinite(ms)&&new Date(ms).toISOString()===value?ms:null;
};
const num=value=>typeof value==="number"&&Number.isFinite(value);
const round=value=>Math.round(value*10000)/10000;
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ownId=value=>typeof value==="string"&&/^oneglobal-[a-f0-9]{24}$/.test(value);
export function validOneGlobalExitPolicy(policy){
  return policy?.mode==="ONE_GLOBAL_VIRTUAL_EXIT_POLICY"
    &&policy?.strategyId==="one-global-committee-forward"
    &&policy?.approvedForVirtualExits===true
    &&policy?.brokerConnectivityAllowed===false
    &&policy?.liveTradingAllowed===false
    &&policy?.allowHistoricalBackfill===false
    &&num(policy?.stopLossPercent)&&policy.stopLossPercent>=1&&policy.stopLossPercent<=15
    &&num(policy?.takeProfitPercent)&&policy.takeProfitPercent>=2&&policy.takeProfitPercent<=30
    &&Number.isSafeInteger(policy?.maxHoldingDays)
    &&policy.maxHoldingDays>=2&&policy.maxHoldingDays<=60;
}
export function proposeOneGlobalVirtualExits({ledger,listings,nowIso,authorityValid=false,policy=null}){
  const now=nowTime(nowIso);
  if(now===null||!ledger||!Array.isArray(ledger.events)||!ledger.positions
    ||!Array.isArray(listings))throw Error("STRATEGY_EXIT_INPUT_INVALID");
  const policyValid=validOneGlobalExitPolicy(policy);
  const intents=[],proposals=[];
  for(const [key,position] of Object.entries(ledger.positions).sort(([a],[b])=>a.localeCompare(b))){
    if(!position||!num(position.quantity)||position.quantity<=0)continue;
    const past=ledger.events.filter(e=>e?.key===key&&e.side==="BUY");
    // The V8 engineering ledger and unrelated virtual strategies are never
    // acquired and liquidated under this owner's ONE GLOBAL strategy policy.
    if(past.length===0||past.some(e=>!ownId(e.intentId)))continue;
    const latest=Math.max(...past.map(e=>nowTime(e.executedAt)??Infinity));
    if(!Number.isFinite(latest)||latest>now)continue;
    const market=listings.find(x=>x.key===key);
    const reasons=[];
    if(!policyValid)reasons.push("EXIT_POLICY_NOT_EXPLICITLY_APPROVED");
    if(!authorityValid)reasons.push("STRATEGY_PAPER_AUTHORITY_MISSING");
    if(!market||market.ready!==true||!num(market.verifiedPrice)
      ||!num(market.fxToEuro)||market.verifiedPrice<=0||market.fxToEuro<=0)
      reasons.push("EXACT_VENUE_OR_TWO_QUOTE_FX_PROOF_MISSING");
    if(!num(position.unitCostEuro)||position.unitCostEuro<=0)
      reasons.push("ENTRY_COST_BASIS_INVALID");
    const gross=market?.ready&&num(market.verifiedPrice)&&num(market.fxToEuro)
      ?round(position.quantity*market.verifiedPrice*market.fxToEuro*(1-0.0005)):null;
    const cost=round(position.quantity*position.unitCostEuro);
    const fee=num(gross)?Math.max(1,round(gross*0.0015)):null;
    const pct=num(gross)&&num(fee)&&cost>0?(gross-fee-cost)/cost*100:null;
    const days=(now-latest)/DAY;
    const reason=policyValid&&pct!==null
      ?pct<=-policy.stopLossPercent?"STOP_LOSS"
      :pct>=policy.takeProfitPercent?"TAKE_PROFIT"
      :days>=policy.maxHoldingDays?"MAX_HOLDING_DAYS":null
      :null;
    const [exchangeMic,symbol]=key.split(":");
    if(!reason)reasons.push("EXIT_TRIGGER_NOT_MET");
    if(market&&market.mic!==exchangeMic)reasons.push("EXACT_LISTING_MISMATCH");
    const id="oneglobal-exit-"+hash({key,prev:ledger.lastHash,reason}).slice(0,24);
    const proposal={id,key,exchangeMic,symbol,reason,daysHeld:round(days),
      projectedNetReturnPercent:pct===null?null:round(pct),
      researchOnly:false,virtualPaperOnly:true,brokerSubmissionAllowed:false,
      certifiedStrategyTrade:false,blockers:[...new Set(reasons)]};
    if(!reasons.length){
      // Allow the CLOSE to exceed an entry-only 5% risk cap when appreciated.
      // The venue engine still enforces cash, actual holdings and turnover.
      intents.push({id,symbol,exchangeMic,side:"SELL",
        strategyId:"one-global-committee-forward",createdAt:nowIso,
        fractionalPaperAllowed:true,maxNotionalEuro:round(gross*1.002+2),
        approvedForWorldPaper:true});
    }
    proposals.push(proposal);
  }
  return {policyValid,authorized:authorityValid,intents,proposals,
    simulatedOnly:true,brokerConnectivityAllowed:false,
    liveTradingAllowed:false,phase9CertificationCredit:0};
}
export function summarizeOneGlobalVirtualAccounting(ledger){
  if(!ledger||!Array.isArray(ledger.events)||!ledger.positions)
    throw Error("STRATEGY_ACCOUNTING_INPUT_INVALID");
  // The upstream engine validates event hashes, fees and portfolio balances.
  // Never use this summary as independent proof of execution or provenance.
  const accounts=new Map();
  let realized=0,roundTrips=0,virtualBuys=0,virtualSells=0;
  for(const event of ledger.events){
    if(!event||!ownId(event.intentId)&&!/^oneglobal-exit-[a-f0-9]{24}$/.test(event.intentId||""))continue;
    if(!num(event.quantity)||event.quantity<=0||!num(event.notionalEuro)||!num(event.feeEuro))
      throw Error("STRATEGY_ACCOUNTING_EVENT_INVALID");
    const p=accounts.get(event.key)||{quantity:0,cost:0};
    if(event.side==="BUY"&&ownId(event.intentId)){
      const basis=event.notionalEuro+event.feeEuro;
      p.cost+=basis;p.quantity+=event.quantity;virtualBuys++;
    }else if(event.side==="SELL"&&/^oneglobal-exit-/.test(event.intentId)){
      if(p.quantity+1e-9<event.quantity)throw Error("STRATEGY_ACCOUNTING_UNMATCHED_EXIT");
      const matchedCost=p.cost*event.quantity/p.quantity;
      realized+=event.notionalEuro-event.feeEuro-matchedCost;
      p.quantity=Math.max(0,Math.round((p.quantity-event.quantity)*1e6)/1e6);
      p.cost=p.quantity===0?0:Math.max(0,p.cost-matchedCost);
      if(p.quantity===0)roundTrips++;
      virtualSells++;
    }
    accounts.set(event.key,p);
  }
  return {scope:"ONE_GLOBAL_STRATEGY_VIRTUAL_ONLY",virtualBuys,virtualSells,
    closedPositionRoundTrips:roundTrips,realizedNetEuro:round(realized),
    openStrategyPositions:[...accounts.values()].filter(x=>x.quantity>0).length,
    lastLedgerHash:ledger.lastHash||null,certifiedForwardTrades:0,
    financeResultsCertified:false,brokerConnectivityAllowed:false,
    liveTradingAllowed:false};
}
