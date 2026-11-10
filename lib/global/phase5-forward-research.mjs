/** Persistent, post-signal, forward virtual research tracking. No executable quotes, orders, or broker I/O.
 * Daily public-chart closes become visible only AFTER observation: they are not tradable paper fills.
 */
import {createHash} from "node:crypto";
import {appendPhase4Signals} from "./phase4-signal-journal.mjs";
import {lookupEcbHistoricalFx} from "./ecb-daily-fx-reference.mjs";

const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const round=n=>Number(n.toFixed(4));
export const PHASE5_FORWARD_POLICY=Object.freeze({initialCashEuro:1000,allocationPct:10,feeEuro:1,exitSessions:5,maxPositions:3,maxEntryLagDays:7});
const MODE="PHASE5_FORWARD_UNATTESTED_VIRTUAL_RESEARCH";
const CLASSIFICATION="OBSERVED_POST_SIGNAL_DAILY_CLOSE_NOT_EXECUTABLE_FILL";
const stamp=s=>Number.isFinite(Date.parse(s))?Date.parse(s):NaN;
const date=s=>s.slice(0,10);
const fail=reason=>{throw Error(reason);};
const samePolicy=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function validatedBars(history,nowIso){
 if(!history||history.synthetic!==false||history.provenanceVerified!==false||
  !/^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\//.test(history.sourceUrl??"")||
  typeof history.instrumentId!=="string"||typeof history.mic!=="string"||typeof history.currency!=="string"||
  !Array.isArray(history.closes))return null;
 let last=-Infinity;
 const bars=[];
 for(const p of history.closes){
  const at=stamp(p?.observedAt),price=p?.close;
  if(!Number.isFinite(at)||at<=last||at>stamp(nowIso)||!Number.isFinite(price)||price<=0)return null;
  last=at;
  if(date(p.observedAt)<date(nowIso))bars.push({at:p.observedAt,price});
 }
 return bars.length?bars:null;
}
function empty(){return {schemaVersion:1,mode:MODE,policy:{...PHASE5_FORWARD_POLICY},
 liveTradingAllowed:false,realPaperCertified:false,paperFillAuthorized:false,ordersGenerated:0,
 entries:[],headHash:"GENESIS"};}
function accounting(rows,policy){
 let cash=policy.initialCashEuro,realized=0,wins=0,losses=0,flat=0;
 const all=new Map(),open=new Map();
 for(const row of rows){
  const e=row.event;
  if(e.type==="OPEN"){
   if(all.has(e.signalHash)||[...open.values()].some(p=>p.instrumentId===e.instrumentId)||
     open.size>=policy.maxPositions)fail("PHASE5_FORWARD_DUPLICATE_OR_CAP");
   const entryCost=e.quantity*e.priceLocal*e.fx.rateToEur+e.feeEuro;
   if(!Number.isFinite(entryCost)||Math.abs(entryCost-e.entryCostEuro)>0.00011||
     e.entryCostEuro>cash+0.00001||e.entryCostEuro<=0)fail("PHASE5_FORWARD_ACCOUNTING_FAILURE");
   cash-=entryCost;all.set(e.signalHash,e);open.set(e.signalHash,e);
  }else if(e.type==="CLOSE"){
   const original=open.get(e.signalHash);
   if(!original||original.instrumentId!==e.instrumentId||original.currency!==e.currency||
    original.quantity!==e.quantity||stamp(e.barAt)<=stamp(original.barAt))fail("PHASE5_FORWARD_INVALID_CLOSE");
   const proceeds=e.quantity*e.priceLocal*e.fx.rateToEur-e.feeEuro;
   const pnl=round(proceeds-original.entryCostEuro);
   if(!Number.isFinite(proceeds)||proceeds<0||Math.abs(pnl-e.netPnlEuro)>0.00011||
      Math.abs(proceeds-e.exitProceedsEuro)>0.00011)fail("PHASE5_FORWARD_ACCOUNTING_FAILURE");
   cash+=proceeds;realized+=pnl;open.delete(e.signalHash);
   if(pnl>0)wins++;else if(pnl<0)losses++;else flat++;
  }else fail("PHASE5_FORWARD_UNKNOWN_EVENT");
 }
 return {cashEuro:round(cash),openPositions:[...open.values()],usedSignalCount:all.size,
  realizedNetPnlEuro:round(realized),closedTrades:wins+losses+flat,wins,losses,flat,
  winRatePct:wins+losses+flat?round(100*wins/(wins+losses+flat)):null};
}
export function validatePhase5ForwardLedger(document,nowIso=new Date().toISOString()){
 if(!Number.isFinite(stamp(nowIso)))fail("PHASE5_FORWARD_CLOCK_INVALID");
 const doc=document??empty();
 if(doc.schemaVersion!==1||doc.mode!==MODE||doc.liveTradingAllowed!==false||
  doc.realPaperCertified!==false||doc.paperFillAuthorized!==false||doc.ordersGenerated!==0||
  !samePolicy(doc.policy,PHASE5_FORWARD_POLICY)||!Array.isArray(doc.entries)||typeof doc.headHash!=="string")
  fail("PHASE5_FORWARD_LEDGER_INVALID");
 let prev="GENESIS",lastRecorded=-Infinity;
 for(const row of doc.entries){
  if(!row||row.previousHash!==prev||row.hash!==digest({previousHash:row.previousHash,event:row.event}))fail("PHASE5_FORWARD_HASH_FAILURE");
  const e=row.event;
  if(!e||!["OPEN","CLOSE"].includes(e.type)||e.classification!==CLASSIFICATION||
   e.brokerOrderId!==null||typeof e.signalHash!=="string"||!/^[0-9a-f]{64}$/.test(e.signalHash)||
   typeof e.instrumentId!=="string"||typeof e.mic!=="string"||e.instrumentId!==e.mic+":"+e.instrumentId.split(":").slice(1).join(":")||
   typeof e.currency!=="string"||!/^[A-Z]{3}$/.test(e.currency)||
   !Number.isFinite(stamp(e.recordedAt))||stamp(e.recordedAt)<lastRecorded||stamp(e.recordedAt)>stamp(nowIso)||
   !Number.isFinite(stamp(e.barAt))||stamp(e.barAt)>=Date.parse(date(e.recordedAt)+"T00:00:00Z")||
   !Number.isFinite(e.quantity)||e.quantity<=0||!Number.isFinite(e.priceLocal)||e.priceLocal<=0||
   e.feeEuro!==doc.policy.feeEuro||e.fx?.ok!==true||e.fx.currency!==e.currency||
   e.fx.eligibleForExecution!==false||e.fx.countsTowardRealPaper!==false||
   !Number.isFinite(e.fx.rateToEur)||e.fx.rateToEur<=0)fail("PHASE5_FORWARD_EVENT_INVALID");
  if(e.type==="OPEN"){
   if(!Number.isFinite(stamp(e.signalCapturedAt))||date(e.barAt)<=date(e.signalCapturedAt)||
     stamp(e.signalCapturedAt)>stamp(e.recordedAt)||!Number.isFinite(e.entryCostEuro)||e.entryCostEuro<=0||
     typeof e.signalAt!=="string"||!Number.isFinite(stamp(e.signalAt))||
     stamp(e.signalAt)>stamp(e.signalCapturedAt))fail("PHASE5_FORWARD_OPEN_INVALID");
  }else if(!Number.isFinite(e.exitProceedsEuro)||!Number.isFinite(e.netPnlEuro))
   fail("PHASE5_FORWARD_CLOSE_INVALID");
  lastRecorded=stamp(e.recordedAt);prev=row.hash;
 }
 if(prev!==doc.headHash)fail("PHASE5_FORWARD_HEAD_MISMATCH");
 return {document:doc,accounting:accounting(doc.entries,doc.policy)};
}
export function advancePhase5ForwardResearch({existing=null,signalJournal=[],histories=[],fxReference=null,
 nowIso=new Date().toISOString()}={}){
 const {document:doc}=validatePhase5ForwardLedger(existing,nowIso);
 if(!Array.isArray(signalJournal)||!Array.isArray(histories))fail("PHASE5_FORWARD_INPUT_INVALID");
 const certifiedJournal=appendPhase4Signals({journal:signalJournal,candidates:[],capturedAt:nowIso});
 const historyIndex=new Map();
 for(const h of histories){
  const key=h?.mic+":"+h?.instrumentId;
  if(historyIndex.has(key))fail("PHASE5_FORWARD_DUPLICATE_MARKET_HISTORY");
  const bars=validatedBars(h,nowIso);
  if(bars)historyIndex.set(key,{history:h,bars});
 }
 const entries=doc.entries.map(x=>({...x}));
 let previousHash=doc.headHash,opened=0,closed=0;
 const append=event=>{
  const row={previousHash,event};row.hash=digest(row);
  entries.push(row);previousHash=row.hash;
 };
 let state=accounting(entries,doc.policy);
 const rejected=[];
 // First close old positions, using five strictly later settled trading-session bars.
 for(const pos of state.openPositions){
  const h=historyIndex.get(pos.mic+":"+pos.instrumentId);
  const start=h?.bars.findIndex(b=>b.at===pos.barAt)??-1;
  if(!h||start<0||!h.bars[start+doc.policy.exitSessions]){rejected.push({instrumentId:pos.instrumentId,reason:"WAITING_FOR_FIVE_LATER_SETTLED_SESSIONS"});continue;}
  const bar=h.bars[start+doc.policy.exitSessions];
  const fx=lookupEcbHistoricalFx({series:fxReference,currency:pos.currency,at:bar.at});
  if(!fx.ok){rejected.push({instrumentId:pos.instrumentId,reason:fx.reason});continue;}
  const proceeds=pos.quantity*bar.price*fx.rateToEur-doc.policy.feeEuro;
  if(!Number.isFinite(proceeds)||proceeds<0){rejected.push({instrumentId:pos.instrumentId,reason:"INVALID_VIRTUAL_EXIT_VALUE"});continue;}
  const event={type:"CLOSE",signalHash:pos.signalHash,mic:pos.mic,instrumentId:pos.instrumentId,
   currency:pos.currency,barAt:bar.at,recordedAt:nowIso,quantity:pos.quantity,priceLocal:bar.price,fx,
   feeEuro:doc.policy.feeEuro,exitProceedsEuro:proceeds,netPnlEuro:round(proceeds-pos.entryCostEuro),
   classification:CLASSIFICATION,brokerOrderId:null};
  append(event);closed++;
 }
 state=accounting(entries,doc.policy);
 const used=new Set(entries.filter(x=>x.event.type==="OPEN").map(x=>x.event.signalHash));
 const signals=[...certifiedJournal.journal].sort((a,b)=>b.signal.score-a.signal.score||a.signal.instrumentId.localeCompare(b.signal.instrumentId));
 for(const row of signals){
  const s=row.signal;
  if(used.has(row.hash)||state.openPositions.some(p=>p.instrumentId===s.instrumentId)||state.openPositions.length>=doc.policy.maxPositions)continue;
  if(s.score<=0||s.dataVerified!==false||s.executable!==false)continue;
  const key=s.mic+":"+s.instrumentId,h=historyIndex.get(key);
  if(!h){rejected.push({instrumentId:s.instrumentId,reason:"NO_VALID_SETTLED_SOURCE_HISTORY"});continue;}
  const entry=h.bars.find(b=>date(b.at)>date(s.capturedAt));
  if(!entry){rejected.push({instrumentId:s.instrumentId,reason:"WAIT_NEXT_POST_SIGNAL_SETTLED_BAR"});continue;}
  const lag=(Date.parse(date(nowIso)+"T00:00:00Z")-Date.parse(date(entry.at)+"T00:00:00Z"))/86400000;
  if(lag>doc.policy.maxEntryLagDays){rejected.push({instrumentId:s.instrumentId,reason:"STALE_ENTRY_BAR"});continue;}
  const fx=lookupEcbHistoricalFx({series:fxReference,currency:h.history.currency,at:entry.at});
  if(!fx.ok){rejected.push({instrumentId:s.instrumentId,reason:fx.reason});continue;}
  const budget=Math.min(doc.policy.initialCashEuro*doc.policy.allocationPct/100,state.cashEuro);
  const qty=Math.floor((budget-doc.policy.feeEuro)/(entry.price*fx.rateToEur)*1000000)/1000000;
  if(!Number.isFinite(qty)||qty<=0){rejected.push({instrumentId:s.instrumentId,reason:"INSUFFICIENT_VIRTUAL_CASH"});continue;}
  const entryCost=qty*entry.price*fx.rateToEur+doc.policy.feeEuro;
  if(entryCost>state.cashEuro+1e-8)fail("PHASE5_FORWARD_CASH_LIMIT_BREACHED");
  const event={type:"OPEN",signalHash:row.hash,mic:s.mic,instrumentId:s.instrumentId,
   currency:h.history.currency,signalAt:s.observedAt,signalCapturedAt:s.capturedAt,
   barAt:entry.at,recordedAt:nowIso,quantity:qty,priceLocal:entry.price,fx,
   feeEuro:doc.policy.feeEuro,entryCostEuro:entryCost,classification:CLASSIFICATION,brokerOrderId:null};
  append(event);opened++;
  state=accounting(entries,doc.policy);
 }
 const next={...doc,entries,headHash:previousHash};
 const verified=validatePhase5ForwardLedger(next,nowIso);
 const summary={schemaVersion:1,mode:MODE,generatedAt:nowIso,source:"UNATTESTED_YAHOO_CLOSES_AND_INDICATIVE_ECB_FX",
  observationPolicy:"ENTRY_IS_FIRST_SUBSEQUENT_SETTLED_BAR_OBSERVED_LATER_NOT_A_REAL_FILL",
  exitPolicy:"FIVE_SUBSEQUENT_SETTLED_SESSION_BARS", ...verified.accounting,
  totalEvents:entries.length,openedThisRun:opened,closedThisRun:closed,rejected,
  ledgerHeadHash:next.headHash,historySources:historyIndex.size,signalsObserved:certifiedJournal.journal.length,
  openPositions:verified.accounting.openPositions.map(p=>({instrumentId:p.instrumentId,mic:p.mic,currency:p.currency,
   signalHash:p.signalHash,entryBarAt:p.barAt,recordedAt:p.recordedAt,entryPriceLocal:p.priceLocal,
   fxReferenceDate:p.fx.referenceDate,quantity:p.quantity,entryCostEuro:round(p.entryCostEuro)})),
  portfolioEquityEuro:verified.accounting.openPositions.length===0?verified.accounting.cashEuro:null,
  realPaperCertified:false,paperFillAuthorized:false,liveTradingAllowed:false,ordersGenerated:0,
  disclaimer:"Research-only virtual close accounting. Not verified quotes, executable orders or forward broker PAPER."};
 return {ledger:next,summary};
}
