/**
 * FENICE ONE GLOBAL — observed-price private PAPER journal.
 * This is a REAL book-keeping event for a hypothetical trade based on a
 * timestamped manually observed public quote. It is NOT an admitted strict
 * EOD-engine FILL, executable close, independently licensed feed, or Phase 9 proof.
 * No brokers, network or external writes; private caller owns disk persistence.
 */
import {createHash} from 'node:crypto';
import {replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';
const fail=x=>{throw Error('OBSERVED_PAPER_'+x)};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const num=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const four=x=>Math.round((x+Number.EPSILON)*1e4)/1e4;
const six=x=>Math.floor((x+1e-12)*1e6)/1e6;
const stamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString()===x;
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function checkOriginalJournal(ledger){
  // Hash consistency alone is insufficient: the source SIGNAL/FILL must also
  // satisfy the original engine's prospective timing, risk and accounting gates.
  replayOneGlobalEodPaperLedger(ledger);
  if(!obj(ledger)||ledger.version!==1||ledger.mode!=='ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER_V1'||ledger.capitalEuro!==1000||ledger.liveTradingAllowed!==false||ledger.brokerConnectivityAllowed!==false||ledger.phase9Credit!==0||!Array.isArray(ledger.events))fail('ORIGINAL_LEDGER_INVALID');
  let prev='GENESIS',last='';
  for(let i=0;i<ledger.events.length;i++){
    const e=ledger.events[i];const {hash:claimed,...body}=e||{};
    if(e?.seq!==i+1||e.prevHash!==prev||!sha(claimed)||hash(body)!==claimed||!stamp(e.recordedAt)||(last&&e.recordedAt<last))fail('ORIGINAL_CHAIN_CORRUPTED');
    prev=claimed;last=e.recordedAt;
  }
  if(ledger.lastHash!==prev)fail('ORIGINAL_LAST_HASH_MISMATCH');
  return ledger;
}
function verifyPractice(entry,original,nowIso){
  if(!obj(entry)||!sha(entry.sha256))fail('PRACTICE_UNHASHED');
  const {sha256,...body}=entry;
  if(hash(body)!==sha256||entry.kind!=='HYPOTHETICAL_PAPER_PRACTICE_ENTRY'||entry.classification!=='PAPER_ESERCIZIO_NON_CERTIFICATO'||!stamp(entry.createdAt)||entry.createdAt>nowIso)fail('PRACTICE_CHANGED_OR_INVALID');
  if(entry.limitations?.officialEodEngineFill!==false||entry.limitations?.certifiedTrades!==0||entry.limitations?.realBrokerFill!==false||entry.limitations?.liveTradingAllowed!==false||entry.limitations?.brokerConnectivityAllowed!==false||entry.limitations?.independentDataLicenseValidated!==false)fail('PRACTICE_SAFETY_FLAGS_MISSING');
  const s=original.events.find(x=>x.kind==='SIGNAL'&&x.hash===entry.linkToOriginalSignal?.signalHash);
  if(!s||s.key!=='XASX:CBA'||s.side!=='BUY'||s.currency!=='AUD'||entry.linkToOriginalSignal?.key!==s.key||entry.linkToOriginalSignal?.sourceLedgerLastHash!==original.lastHash||s.recordedAt!==entry.linkToOriginalSignal.signalRecordedAt)fail('PRACTICE_ORIGINAL_SIGNAL_MISMATCH');
  if(original.events.some(x=>x.kind==='FILL'&&x.signalHash===s.hash)||original.events.some(x=>x.kind==='CANCEL'&&x.signalHash===s.hash))fail('SIGNAL_ALREADY_CLOSED');
  // First ASX pilot: Nov 12 completed close -> Nov 13 completed session.
  if(s.referenceSessionDate!=='2026-11-12'||entry.referenceSessionDate!=='2026-11-12'||entry.executionSessionDate!=='2026-11-13'||s.decisionAt>='2026-11-12T23:00:00.000Z')fail('PROSPECTIVE_WINDOW_INVALID');
  const q=entry.researchQuote,f=entry.ecbReference,a=entry.hypotheticalAccounting;
  if(!obj(q)||q.sourceMode!=='MANUALLY_REVIEWED_PUBLIC_DISPLAY_RESEARCH_ONLY'||q.independentProviderReceiptsValidated!==false||q.providerRightsApprovedForAutomatedNonDisplay!==false||!num(q.priceAUD)||!stamp(q.observedAt)||q.observedAt<'2026-11-13T05:11:00.000Z'||q.observedAt>nowIso)fail('RESEARCH_OBSERVATION_INVALID');
  if(typeof q.url!=='string'||!q.url.startsWith('https://markets.ft.markitdigital.com/data/equities/tearsheet/historical?'))fail('SOURCE_PROVENANCE_UNEXPECTED');
  if(!obj(f)||f.series!=='EXR.D.AUD.EUR.SP00.A'||f.date!=='2026-11-12'||!num(f.audPerEur)||f.nonTradingReference!==true||Math.abs(f.eurPerAud-1/f.audPerEur)>1e-12)fail('FX_OBSERVATION_INVALID');
  const unitEuro=q.priceAUD/f.audPerEur*1.0005;
  const units=six(Math.min(s.maxNotionalEuro,49)/unitEuro);
  const gross=four(units*unitEuro),fee=1,cash=four(1000-gross-fee);
  if(!obj(a)||!num(units)||units!==a.virtualShares||Math.abs(unitEuro-a.unitPriceWith5bpsEuro)>1e-9||Math.abs(a.virtualNotionalEuro-gross)>1e-4||Math.abs(a.remainingVirtualCashEuro-cash)>1e-4||a.feesEuro!==fee||a.initialCashEuro!==1000||gross+fee>50)fail('PRACTICE_ACCOUNTING_MISMATCH');
  return {signal:s,priceAUD:q.priceAUD,fxAUDperEUR:f.audPerEur,qty:units,gross,fee,cash};
}
export function newOneGlobalObservedPaperLedger(){return {version:1,mode:'ONE_GLOBAL_OBSERVED_PAPER_PRIVATE_V1',capitalEuro:1000,cashEuro:1000,positions:{},events:[],lastHash:'GENESIS',virtualFills:0,strictPaperFills:0,certifiedTrades:0,phase9Credit:0,liveTradingAllowed:false,brokerConnectivityAllowed:false};}
export function replayOneGlobalObservedPaper(ledger){
 if(!obj(ledger)||ledger.version!==1||ledger.mode!=='ONE_GLOBAL_OBSERVED_PAPER_PRIVATE_V1'||ledger.capitalEuro!==1000||ledger.strictPaperFills!==0||ledger.certifiedTrades!==0||ledger.phase9Credit!==0||ledger.liveTradingAllowed!==false||ledger.brokerConnectivityAllowed!==false||!Array.isArray(ledger.events)||ledger.events.length>1000)fail('LEDGER_SCHEMA');
 let prev='GENESIS',cash=1000;const positions={};const seen=new Set();
 for(let i=0;i<ledger.events.length;i++){
   const e=ledger.events[i],{hash:claimed,...body}=e||{};
   if(e?.seq!==i+1||e.prevHash!==prev||!sha(claimed)||hash(body)!==claimed||e.kind!=='FILL'||e.executionClassification!=='OBSERVED_CLOSE_PERSONAL_PAPER_UNCERTIFIED'||!stamp(e.recordedAt)||!sha(e.originalSignalHash)||!sha(e.practiceFileHash)||seen.has(e.originalSignalHash)||!num(e.units)||!num(e.unitPriceEuro)||!num(e.grossEuro)||!num(e.feeEuro)||!num(e.sourceCloseAUD)||!num(e.fxAUDperEUR)||e.brokerExecuted!==false||e.strictEodEligible!==false||e.phase9Credit!==0)fail('LEDGER_EVENT_INVALID');
   if(e.feeEuro!==1||four(e.units*e.unitPriceEuro)!==e.grossEuro||e.grossEuro+e.feeEuro>50.0001)fail('LEDGER_ACCOUNTING');
   if(e.key!=='XASX:CBA'||e.mic!=='XASX'||e.currency!=='AUD'||positions[e.key])fail('LEDGER_POSITION_INVALID');
   cash=four(cash-e.grossEuro-e.feeEuro);
   positions[e.key]={units:e.units,costEuro:four(e.grossEuro+e.feeEuro),classification:e.executionClassification};
   prev=claimed;seen.add(e.originalSignalHash);
 }
 if(ledger.lastHash!==prev||ledger.cashEuro!==cash||JSON.stringify(ledger.positions)!==JSON.stringify(positions)||ledger.virtualFills!==ledger.events.length)fail('LEDGER_REPLAY_MISMATCH');
 return {valid:true,virtualFills:ledger.virtualFills,cashEuro:cash,positions,strictPaperFills:0,certifiedTrades:0,phase9Credit:0,liveTradingAllowed:false,brokerConnectivityAllowed:false};
}
export function recordOneGlobalObservedPaper({originalLedger,practiceEntry,previousLedger,nowIso}){
 if(!stamp(nowIso))fail('CLOCK');
 const original=checkOriginalJournal(originalLedger);
 const source=verifyPractice(practiceEntry,original,nowIso);
 const ledger=structuredClone(previousLedger||newOneGlobalObservedPaperLedger());
 replayOneGlobalObservedPaper(ledger);
 if(ledger.events.some(e=>e.originalSignalHash===source.signal.hash))fail('DUPLICATE_SIGNAL_FILL');
 const event={seq:ledger.events.length+1,prevHash:ledger.lastHash,kind:'FILL',recordedAt:nowIso,
  executionClassification:'OBSERVED_CLOSE_PERSONAL_PAPER_UNCERTIFIED',
  key:source.signal.key,mic:'XASX',currency:'AUD',side:'BUY',originalSignalHash:source.signal.hash,
  referenceSessionDate:'2026-11-12',executionSessionDate:'2026-11-13',practiceFileHash:practiceEntry.sha256,
  sourceQuote:'Financial Times publicly displayed CBA close',sourceQuoteObservedAt:practiceEntry.researchQuote.observedAt,
  sourceCloseAUD:source.priceAUD,fxAUDperEUR:source.fxAUDperEUR,
  units:source.qty,unitPriceEuro:source.priceAUD/source.fxAUDperEUR*1.0005,grossEuro:source.gross,feeEuro:source.fee,
  hypotheticalExecutionOnly:true,brokerExecuted:false,independentMarketDataRightsVerified:false,
  strictEodEligible:false,phase9Credit:0};
 ledger.events.push({...event,hash:hash(event)});
 ledger.lastHash=ledger.events.at(-1).hash;
 ledger.cashEuro=source.cash;
 ledger.positions[source.signal.key]={units:source.qty,costEuro:four(source.gross+source.fee),classification:event.executionClassification};
 ledger.virtualFills=ledger.events.length;
 return {ledger,status:replayOneGlobalObservedPaper(ledger)};
}