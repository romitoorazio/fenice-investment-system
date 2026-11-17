import assert from 'node:assert/strict';
import {reconcileDirectaLocalSnapshot as reconcile} from '../lib/brokers/directa-local-reconciliation.mjs';

// Synthetic local fixtures only: no real account, provider, ledger or order.
const now=Date.parse('2026-11-17T18:00:01.000Z');
const snapshot={generatedAt:'2026-11-17T18:00:00.000Z',source:'directa-dapi-local',
  mode:'read-only',host:'loopback',tradingPort:10002,liveTradingAllowed:false,writeCommandsBlocked:true,
  connection:{state:'CONN_OK',healthy:true},account:{identifierPersisted:false,identifierPresent:true,
    liquidity:1000,equity:1000},availability:{totalLiquidity:1000},positions:[],orders:[],errors:[],
  diagnostics:{stockListComplete:true,orderListComplete:true,receivedMessages:8}};
const expectation={positions:[],openOrderClientIds:[],expectedCashEuro:1000};
const run=(s=snapshot,e=expectation,time=now)=>reconcile({snapshot:s,expectation:e,now:time});
const safe=r=>{
  assert.equal(r.brokerWritesAuthorized,false);
  assert.equal(r.liveTradingAllowed,false);
  assert.equal(r.executionReconciliationVerified,false);
  assert.equal(r.fullTradingReadinessVerified,false);
};
const ok=run();safe(ok);assert.equal(ok.state,'VERIFIED');
assert.equal(ok.brokerReconciliationVerified,true);
const blocked=(s,e,reason,time=now)=>{
  const r=run(s,e,time);safe(r);assert.equal(r.state,'BLOCKED');
  assert.equal(r.brokerReconciliationVerified,false);
  assert(r.failures.includes(reason)||r.breakCodes.includes(reason),reason);
  return r;
};
blocked(null,expectation,'LOCAL_SNAPSHOT_MISSING');
blocked({...snapshot,generatedAt:'2026-11-17T17:59:00.000Z'},expectation,'LOCAL_SNAPSHOT_STALE_OR_INVALID_CLOCK');
blocked(snapshot,expectation,'LOCAL_SNAPSHOT_STALE_OR_INVALID_CLOCK',now-2000);
blocked({...snapshot,liveTradingAllowed:true},expectation,'READ_ONLY_BOUNDARY_UNVERIFIED');
blocked({...snapshot,diagnostics:{...snapshot.diagnostics,orderListComplete:false}},expectation,'BROKER_LISTS_INCOMPLETE');
blocked({...snapshot,errors:[{code:1024}]},expectation,'BROKER_PROTOCOL_ERRORS');
for(const e of [null,{}, {...expectation,expectedCashEuro:NaN},
  {...expectation,expectedCashEuro:Infinity},{...expectation,expectedCashEuro:'1000'},
  {...expectation,expectedCashEuro:-1},{...expectation,paperLedger:{cashEuro:1000}},
  {...expectation,positions:[{symbol:'TEST',quantity:NaN}]},
  {...expectation,positions:[{symbol:'TEST',quantity:1},{symbol:'test',quantity:1}]},
  {...expectation,openOrderClientIds:['PRIVATE_ID','PRIVATE_ID']}])
  blocked(snapshot,e,'BROKER_EXPECTATION_INVALID');
const wrongCash=blocked(snapshot,{...expectation,expectedCashEuro:999},'CASH');
assert.equal(wrongCash.positionsAndCashMatched,false);
assert.equal(wrongCash.openOrdersMatched,true);
blocked(snapshot,{...expectation,positions:[{symbol:'PRIVATE_STOCK',quantity:2}]},'POSITION');
blocked(snapshot,{...expectation,openOrderClientIds:['PRIVATE_ID']},'OPEN_ORDER');
const position={ticker:'PRIVATE_STOCK',observedAt:'18:00:00',portfolioQuantity:2,directaQuantity:2,averagePrice:10};
const order={ticker:'PRIVATE_STOCK',observedAt:'18:00:00',operation:'ACQAZ',clientOrderId:'PRIVATE_ID',
  brokerReference:'PRIVATE_REF',quantity:10,stateCode:2000,state:'IN_NEGOTIATION'};
blocked({...snapshot,positions:[position,position]},expectation,'BROKER_DUPLICATE_ROWS_OR_IDENTIFIERS');
blocked({...snapshot,orders:[order,order]},expectation,'BROKER_DUPLICATE_ROWS_OR_IDENTIFIERS');
blocked({...snapshot,orders:[order,{...order,clientOrderId:'SECOND_ID'}]},expectation,'BROKER_DUPLICATE_ROWS_OR_IDENTIFIERS');
blocked({...snapshot,orders:[{...order,clientOrderId:''}]},expectation,'BROKER_OPEN_ORDER_CLIENT_ID_MISSING');
blocked({...snapshot,orders:[{...order,state:'UNKNOWN'}]},expectation,'BROKER_ORDER_STATE_AMBIGUOUS');
const partial={...snapshot,positions:[position],orders:[order],availability:{totalLiquidity:980}};
const partialExpectation={positions:[{symbol:'private_stock',quantity:2}],
  openOrderClientIds:['PRIVATE_ID'],expectedCashEuro:980};
const partialResult=run(partial,partialExpectation);safe(partialResult);
assert.equal(partialResult.brokerReconciliationVerified,true,
  'Match current cumulative cash/positions and retain the still-open residual order');
assert.equal(partialResult.executionReconciliationVerified,false,
  'Snapshot matching cannot attest each individual partial execution');
blocked({...partial,orders:[{...order,stateCode:2001,state:'SUBMISSION_ERROR'}]},partialExpectation,'OPEN_ORDER');
blocked({...partial,orders:[{...order,stateCode:2003,state:'FILLED'}]},partialExpectation,'OPEN_ORDER');
blocked({...partial,orders:[{...order,stateCode:2004,state:'CANCELLED'}]},partialExpectation,'OPEN_ORDER');
const serialized=JSON.stringify(partialResult);
for(const secret of ['PRIVATE_STOCK','PRIVATE_ID','PRIVATE_REF','980'])assert(!serialized.includes(secret));
console.log('PASS local Directa reconciliation: finite expectations, complete fresh snapshot, duplicate/unknown/open-order protection, cash and holdings, no execution or LIVE certification.');
