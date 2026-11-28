import {replayOneGlobalEodPaperLedger} from '../trading/one-global-eod-paper.mjs';

// Owner-only projection. Never writes the journal or treats the entry price as a current mark.
const money=x=>Math.round(x*10000)/10000;
export function projectR2PaperEconomics(ledger){
  const replay=replayOneGlobalEodPaperLedger(ledger);
  const open=new Map(), trades=[], closed=[];
  let fees=0, impact=0;
  for(const e of ledger.events){
    if(e.kind!=='FILL')continue;
    const reference=(e.providerReceipts[0].close+e.providerReceipts[1].close)/2*e.fxRateToEuro;
    const row={key:e.key,side:e.side,sessionDate:e.sessionDate,recordedAt:e.recordedAt,
      quantity:e.quantity,executionUnitEuro:e.notionalEuro/e.quantity,
      notionalEuro:e.notionalEuro,feeEuro:e.feeEuro,slippageBps:e.slippageBps,
      estimatedSlippageEuro:money(reference*e.quantity*e.slippageBps/10000),realizedNetEuro:null};
    fees+=e.feeEuro;impact+=row.estimatedSlippageEuro;
    if(e.side==='BUY')open.set(e.key,row);
    else{
      const buy=open.get(e.key);
      if(!buy)throw Error('R2_ECONOMIC_RECONCILIATION_FAILED');
      row.realizedNetEuro=money(e.notionalEuro-e.feeEuro-buy.notionalEuro-buy.feeEuro);
      closed.push(row.realizedNetEuro);open.delete(e.key);
    }
    trades.push(row);
  }
  const positions=Object.entries(replay.positions).map(([key,p])=>{
    const entry=open.get(key);
    if(!entry||entry.quantity!==p.quantity)throw Error('R2_ECONOMIC_RECONCILIATION_FAILED');
    return {key,quantity:p.quantity,costEuro:p.costEuro,entryUnitEuro:entry.executionUnitEuro,
      entrySessionDate:entry.sessionDate,currentUnitEuro:null,currentValueEuro:null,unrealizedNetEuro:null};
  });
  const invested=money(positions.reduce((sum,p)=>sum+p.costEuro,0));
  if(money(closed.reduce((sum,p)=>sum+p,0))!==replay.realizedNetEuro||
     Math.abs(money(replay.cashEuro+invested-ledger.capitalEuro)-replay.realizedNetEuro)>0.00011)
    throw Error('R2_ECONOMIC_RECONCILIATION_FAILED');
  const gains=closed.filter(x=>x>0),losses=closed.filter(x=>x<0);
  const flat=positions.length===0;
  return {state:'R2_ECONOMICS_REPLAY_VERIFIED',initialCapitalEuro:ledger.capitalEuro,
    cashEuro:replay.cashEuro,investedCostEuro:invested,portfolioValueEuro:flat?replay.cashEuro:null,
    realizedNetEuro:replay.realizedNetEuro,unrealizedNetEuro:flat?0:null,
    netReturnPercent:flat?money((replay.cashEuro/ledger.capitalEuro-1)*100):null,
    feesEuro:money(fees),estimatedSlippageEuro:money(impact),
    maxDrawdownPercent:null,
    winRatePercent:closed.length?money(gains.length/closed.length*100):null,
    profitFactor:losses.length?money(gains.reduce((a,x)=>a+x,0)/-losses.reduce((a,x)=>a+x,0)):null,
    benchmarkReturnPercent:null,positionCount:positions.length,closedRoundTrips:closed.length,
    fillCount:trades.length,positions,trades:trades.slice(-100).reverse(),
    historyTruncated:trades.length>100,liveTradingAllowed:false,brokerConnectivityAllowed:false,
    strategyPerformanceCertified:false};
}
