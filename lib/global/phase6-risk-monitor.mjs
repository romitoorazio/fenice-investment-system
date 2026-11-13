/** Phase 6: closed-trade-only virtual risk monitoring. Never evaluates executable signals or brokers.
 * Pure deterministic risk check; caller must first validate the forward hash-linked ledger.
 */
export const PHASE6_POLICY=Object.freeze({maxRealizedDrawdownPct:10,maxConsecutiveLosses:3,warnDrawdownPct:5});
const round=n=>Number(n.toFixed(4));
export function assessPhase6ForwardRisk({entries=[],initialCashEuro=1000}={}){
 if(!Array.isArray(entries)||!Number.isFinite(initialCashEuro)||initialCashEuro<=0)
  throw Error("INVALID_PHASE6_RISK_INPUT");
 let realizedBalance=initialCashEuro,peak=initialCashEuro,maxDrawdownEuro=0,
  lossStreak=0,maxLossStreak=0,wins=0,losses=0,flat=0;
 const closed=[];
 for(const row of entries){
  const e=row?.event;
  if(e?.type==="OPEN")continue;
  if(e?.type!=="CLOSE"||!Number.isFinite(e.netPnlEuro)||
   typeof e.instrumentId!=="string"||typeof e.recordedAt!=="string")
    throw Error("PHASE6_UNKNOWN_RISK_EVENT");
  realizedBalance+=e.netPnlEuro;
  if(!Number.isFinite(realizedBalance))throw Error("PHASE6_INVALID_BALANCE");
  if(e.netPnlEuro>0){wins++;lossStreak=0;}
  else if(e.netPnlEuro<0){losses++;lossStreak++;}
  else{flat++;lossStreak=0;}
  peak=Math.max(peak,realizedBalance);
  maxDrawdownEuro=Math.max(maxDrawdownEuro,peak-realizedBalance);
  maxLossStreak=Math.max(maxLossStreak,lossStreak);
  closed.push({instrumentId:e.instrumentId,realizedPnlEuro:e.netPnlEuro,recordedAt:e.recordedAt});
 }
 const maxDrawdownPct=round(maxDrawdownEuro/initialCashEuro*100);
 const reasons=[];
 if(maxDrawdownPct>=PHASE6_POLICY.maxRealizedDrawdownPct)
  reasons.push("MAX_REALIZED_DRAWDOWN_REACHED");
 if(lossStreak>=PHASE6_POLICY.maxConsecutiveLosses)
  reasons.push("CONSECUTIVE_LOSSES_REACHED");
 const halted=reasons.length>0;
 return {mode:"PHASE6_VIRTUAL_FORWARD_RISK_RESEARCH_ONLY",policy:{...PHASE6_POLICY},
  initialCashEuro,closedTrades:closed.length,wins,losses,flat,
  realizedNetPnlEuro:round(realizedBalance-initialCashEuro),
  maxRealizedDrawdownEuro:round(maxDrawdownEuro),maxRealizedDrawdownPct:maxDrawdownPct,
  currentConsecutiveLosses:lossStreak,maxConsecutiveLossesObserved:maxLossStreak,
  riskState:halted?"HALT_NEW_VIRTUAL_ENTRIES":maxDrawdownPct>=PHASE6_POLICY.warnDrawdownPct?"WATCH":"ACTIVE",
  haltNewVirtualEntries:halted,haltReasons:reasons,
  equityIsMarkToMarket:false,drawdownBasis:"CLOSED_TRADES_ONLY_EXCLUDES_OPEN_POSITIONS",
  sourceStatus:"UNATTESTED_RESEARCH",realPaperCertified:false,liveTradingAllowed:false,
  ordersGenerated:0};
}
