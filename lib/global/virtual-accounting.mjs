/** ONE GLOBAL: read-only, funded FIFO accounting of VIRTUAL fills.
 * Explicit fee policy is essential: old events do not encode fee currency.
 * No quote lookups, broker calls, market-value guesses, or real PAPER certification.
 */
import {replayVirtualLedger} from "./virtual-ledger.mjs";
const round=value=>Math.round((value+Number.EPSILON)*100)/100;
const finitePositive=value=>typeof value==="number"&&Number.isFinite(value)&&value>0;
const fail=(reason,eventIndex=null)=>({ok:false,reason,eventIndex,countsTowardRealPaper:false,liveTradingAllowed:false});

export function summarizeVirtualPaperLedger({ledger,initialCapitalEur,feeCurrency,expectedCampaignId}={}){
  let audit;
  try{audit=replayVirtualLedger(ledger);}catch{return fail("LEDGER_REPLAY_INVALID");}
  if(!audit.valid)return fail(audit.reason);
  if(!finitePositive(initialCapitalEur)||initialCapitalEur>1e12)return fail("INVALID_VIRTUAL_CAPITAL");
  if(feeCurrency!=="QUOTE_CURRENCY")return fail("FEE_CURRENCY_POLICY_REQUIRED");
  if(expectedCampaignId!==undefined&&(typeof expectedCampaignId!=="string"||!expectedCampaignId.trim()))return fail("INVALID_CAMPAIGN_SCOPE");
  const lots=new Map();
  let cash=initialCapitalEur,realized=0,fees=0,buyCount=0,sellCount=0,winningSells=0;
  let lastEventTime=-Infinity,campaign=expectedCampaignId??null;
  for(let i=0;i<ledger.events.length;i++){
    const e=ledger.events[i],at=Date.parse(e.occurredAt);
    if(at<lastEventTime)return fail("NON_CHRONOLOGICAL_VIRTUAL_EVENTS",i);
    lastEventTime=at;
    if(campaign===null)campaign=e.identity.campaignId;
    if(e.identity.campaignId!==campaign)return fail("MIXED_VIRTUAL_CAMPAIGNS",i);
    const gross=e.price*e.quantity*e.fxToEur;
    const fee=e.fees*e.fxToEur;
    if(!Number.isFinite(gross)||!Number.isFinite(fee)||gross<=0||fee<0)return fail("INVALID_CONVERTED_VIRTUAL_AMOUNT",i);
    const key=e.identity.instrumentId;
    const position=lots.get(key)??[];
    if(e.side==="BUY"){
      const debit=gross+fee;
      if(!Number.isFinite(debit)||debit>cash+1e-8)return fail("INSUFFICIENT_VIRTUAL_EUR_CAPITAL",i);
      cash-=debit;
      position.push({remaining:e.quantity,costPerUnitEur:debit/e.quantity});
      lots.set(key,position);
      buyCount++;
    }else{
      const available=position.reduce((sum,lot)=>sum+lot.remaining,0);
      if(available+1e-9<e.quantity)return fail("VIRTUAL_SHORT_SELL_FORBIDDEN",i);
      const proceeds=gross-fee;
      if(!Number.isFinite(proceeds)||cash+proceeds<-1e-8)return fail("INSUFFICIENT_VIRTUAL_EUR_CAPITAL",i);
      let remaining=e.quantity,allocatedCost=0;
      for(const lot of position){
        if(remaining<=1e-9)break;
        const used=Math.min(lot.remaining,remaining);
        allocatedCost+=used*lot.costPerUnitEur;
        lot.remaining-=used;
        remaining-=used;
      }
      if(remaining>1e-8)return fail("VIRTUAL_SHORT_SELL_FORBIDDEN",i);
      const tradeResult=proceeds-allocatedCost;
      realized+=tradeResult;
      if(tradeResult>0)winningSells++;
      cash+=proceeds;
      sellCount++;
    }
    fees+=fee;
    if(!Number.isFinite(cash)||!Number.isFinite(realized)||!Number.isFinite(fees))return fail("INVALID_ACCOUNTING_ACCUMULATOR",i);
  }
  const positions=[];
  let costBasisEur=0;
  for(const [instrumentId,position] of lots){
    const quantity=position.reduce((sum,lot)=>sum+lot.remaining,0);
    if(quantity<=1e-9)continue;
    const cost=position.reduce((sum,lot)=>sum+lot.remaining*lot.costPerUnitEur,0);
    costBasisEur+=cost;
    positions.push({instrumentId,quantity,bookCostEur:round(cost)});
  }
  if(!Number.isFinite(costBasisEur))return fail("INVALID_ACCOUNTING_ACCUMULATOR");
  positions.sort((a,b)=>a.instrumentId.localeCompare(b.instrumentId));
  return {ok:true,reason:null,mode:"VIRTUAL_FIFO_ACCOUNTING_ONLY",campaignId:campaign,
    initialCapitalEur:round(initialCapitalEur),cashEur:round(cash),
    realizedNetPnlEur:round(realized),totalFeesEur:round(fees),openBookCostEur:round(costBasisEur),
    bookEquityEur:round(cash+costBasisEur),unrealizedPnlEur:null,
    markToMarketValueEur:null,drawdownEur:null,closedFillWinRatePct:sellCount?round(winningSells/sellCount*100):null,
    buyCount,sellCount,eventCount:ledger.events.length,positions,
    feeCurrencyPolicy:"QUOTE_CURRENCY",valuationPolicy:"HISTORICAL_COST_NOT_MARK_TO_MARKET",
    countsTowardRealPaper:false,investmentPerformanceCertified:false,
    liveTradingAllowed:false,brokerConnectivityAllowed:false};
}
