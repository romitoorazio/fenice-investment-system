/** Local account reconciliation only. Never imports PAPER balances as broker
 * expectations, creates orders, serializes trading commands or opens sockets.
 * The frozen reconciliation engine is unchanged; this boundary rejects
 * malformed input before NaN coercion or duplicate Map keys can hide breaks.
 */
import {reconcileWithDirecta} from '../trading/broker-reconciliation.ts';
import {assessDirectaLocalSnapshotEvidence} from '../ui/directa-local-snapshot-evidence.mjs';

const number=x=>typeof x==='number'&&Number.isFinite(x);
const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=128;
const symbol=x=>text(x)?x.trim().toUpperCase():null;
const unique=xs=>new Set(xs).size===xs.length;
const open=new Set(['IN_NEGOTIATION','IN_NEGOTIATION_AFTER_CONFIRMATION','AWAITING_CONFIRMATION','MODIFIED']);
const safety={brokerWritesAuthorized:false,liveTradingAllowed:false,
  executionReconciliationVerified:false,fullTradingReadinessVerified:false};
export function reconcileDirectaLocalSnapshot({snapshot,expectation,now=Date.now()}={}){
  const integrity=assessDirectaLocalSnapshotEvidence(snapshot,now);
  const result={state:'BLOCKED',brokerReconciliationVerified:false,
    positionsAndCashMatched:false,openOrdersMatched:false,breakCount:0,
    breakCodes:[],failures:[],...safety};
  if(!integrity.complete)return {...result,failures:integrity.failures};
  const validExpectation=expectation&&typeof expectation==='object'&&!Array.isArray(expectation)
    &&Object.keys(expectation).every(k=>['positions','openOrderClientIds','expectedCashEuro'].includes(k))
    &&number(expectation.expectedCashEuro)&&expectation.expectedCashEuro>=0
    &&Array.isArray(expectation.positions)&&expectation.positions.length<=10_000
    &&expectation.positions.every(p=>p&&symbol(p.symbol)&&number(p.quantity))
    &&unique(expectation.positions.map(p=>symbol(p.symbol)))
    &&Array.isArray(expectation.openOrderClientIds)&&expectation.openOrderClientIds.length<=10_000
    &&expectation.openOrderClientIds.every(text)&&unique(expectation.openOrderClientIds);
  if(!validExpectation)return {...result,failures:['BROKER_EXPECTATION_INVALID']};
  if(!unique(snapshot.positions.map(p=>symbol(p.ticker)))
    ||!unique(snapshot.orders.map(o=>o.clientOrderId).filter(text))
    ||!unique(snapshot.orders.map(o=>o.brokerReference).filter(text)))
    return {...result,failures:['BROKER_DUPLICATE_ROWS_OR_IDENTIFIERS']};
  // Manual orders without a client ID must remain visible, never disappear
  // through the frozen engine's filter(Boolean) on open-order client IDs.
  if(snapshot.orders.some(o=>open.has(o.state)&&!text(o.clientOrderId)))
    return {...result,failures:['BROKER_OPEN_ORDER_CLIENT_ID_MISSING']};
  // Normalize symbols identically on both sides after checking uniqueness.
  const normalized={...snapshot,positions:snapshot.positions.map(p=>({...p,ticker:symbol(p.ticker)}))};
  const report=reconcileWithDirecta({...expectation,
    positions:expectation.positions.map(p=>({...p,symbol:symbol(p.symbol)}))},normalized);
  const codes=[...new Set(report.breaks.map(b=>b.code))];
  return {...result,state:report.balanced?'VERIFIED':'BLOCKED',
    brokerReconciliationVerified:report.balanced,
    positionsAndCashMatched:!codes.some(c=>['POSITION','CASH'].includes(c)),
    openOrdersMatched:!codes.includes('OPEN_ORDER'),breakCount:report.breaks.length,
    breakCodes:codes,failures:report.balanced?[]:['BROKER_RECONCILIATION_BREAK']};
}
