/**
 * FENICE ONE GLOBAL — private, forward-only EOD PAPER laboratory.
 * SIGNAL after a completed session -> hypothetical next-session CLOSE+impact
 * after two independent provider receipts are published. Not a live fill,
 * an intraday certification, a broker interface, or Phase 9 evidence.
 * Never serialize real receipts into the public repository.
 */
import {createHash} from "node:crypto";
import {auditOneGlobalEodPilotSignalWindow} from "./one-global-eod-pilot-time-audit.mjs";
const MODE="ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER_V1";
const INITIAL_EURO=1000,MAX_POSITION_EURO=50,MAX_TURNOVER_EURO=200;
const EXCHANGE_TZ=Object.freeze({XMIL:"Europe/Rome",XETR:"Europe/Berlin",
  XPAR:"Europe/Paris",XLON:"Europe/London",XSWX:"Europe/Zurich",
  XTKS:"Asia/Tokyo",XHKG:"Asia/Hong_Kong",XASX:"Australia/Sydney",
  XNYS:"America/New_York",XNAS:"America/New_York",
  XJSE:"Africa/Johannesburg",XSES:"Asia/Singapore"});
const venueDate=(iso,mic)=>{
  const t=stamp(iso),zone=EXCHANGE_TZ[mic];
  if(t===null||!zone)return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
    timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",
  }).formatToParts(new Date(t)).map(p=>[p.type,p.value]));
  return parts.year+"-"+parts.month+"-"+parts.day;
};
const IMPACT_BPS=5,FEE_RATE=.0015,MIN_FEE_EURO=1;
const hash=o=>createHash("sha256").update(JSON.stringify(o)).digest("hex");
const amt=x=>Math.round((x+Number.EPSILON)*1e4)/1e4;
const floorShares=x=>Math.floor(x*1e6)/1e6;
const goodNumber=x=>typeof x==="number"&&Number.isFinite(x)&&x>0;
const stamp=x=>typeof x==="string"
  &&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)
  &&Number.isFinite(Date.parse(x))&&new Date(Date.parse(x)).toISOString()===x?Date.parse(x):null;
const day=x=>typeof x==="string"&&/^\d{4}-\d\d-\d\d$/.test(x)
  &&Number.isFinite(Date.parse(x+"T00:00:00Z"))
  &&new Date(x+"T00:00:00Z").toISOString().slice(0,10)===x;
const sha=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const key=x=>typeof x==="string"&&/^[A-Z0-9]{4}:[A-Z0-9][A-Z0-9._-]{0,23}$/.test(x);
const family=x=>typeof x==="string"&&/^[a-z0-9][a-z0-9._-]{0,63}$/.test(x.toLowerCase())
  &&x.trim()===x?x.toLowerCase():null;
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const dailyDistance=(a,b)=>(Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/86400000;
const safeFlags=o=>o?.liveTradingAllowed===false
  &&o?.brokerConnectivityAllowed===false&&o?.phase9Credit===0;
const reject=reason=>{throw Error("EOD_PAPER_"+reason);};
export function newOneGlobalEodPaperLedger(){
  return {version:1,mode:MODE,capitalEuro:INITIAL_EURO,cashEuro:INITIAL_EURO,
    positions:{},events:[],lastHash:"GENESIS",paperScope:"PRIVATE_FORWARD_SIMULATION_UNCERTIFIED",
    sourceRightsIndependentlyCertified:false,strategyPerformanceCertified:false,
    phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
}
export function validPrivateEodAuthority(a,nowIso){
  const now=stamp(nowIso),start=stamp(a?.approvedAt),end=stamp(a?.expiresAt);
  return now!==null&&start!==null&&end!==null&&start<=now&&end>now&&
    end-start<=90*86400000
    &&a?.mode==="ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER"
    &&a?.ownerConsent===true&&a?.approvedForVirtualSimulation===true
    &&a?.approvalEvidence?.kind==="EXPLICIT_OWNER_CONSENT"
    &&/^[a-f0-9]{40}$/.test(a?.approvalEvidence?.reviewedCommit||"")
    &&a?.executionMethod==="NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT"
    &&a?.allowBackfill===false&&a?.liveTradingAllowed===false
    &&a?.brokerConnectivityAllowed===false&&a?.realBrokerOrdersAllowed===false
    &&a?.strategyPerformanceCertified===false;
}
function checkSignal(e,lastTime,pending){
  if(!key(e.key)||!["BUY","SELL"].includes(e.side)||!day(e.referenceSessionDate)
    ||!stamp(e.referenceCloseAt)||!stamp(e.referencePublishedAt)
    ||venueDate(e.referenceCloseAt,e.mic)!==e.referenceSessionDate
    ||!sha(e.sourceSnapshotHash)||!goodNumber(e.maxNotionalEuro)
    ||e.maxNotionalEuro>MAX_POSITION_EURO
    ||typeof e.strategyReason!=="string"
    ||!["UPTREND_CONFIRMATION","DOWNTREND_EXIT","STOP_LOSS_RESEARCH","MAX_HOLDING_EXIT"].includes(e.strategyReason)
    ||!e.key.startsWith(e.mic+":")||!(/^[A-Z]{3}$/).test(e.currency||"")
    ||stamp(e.referenceCloseAt)>=stamp(e.referencePublishedAt)
    ||stamp(e.referencePublishedAt)>stamp(e.recordedAt)
    ||stamp(e.recordedAt)-stamp(e.referencePublishedAt)>48*3600000
    ||stamp(e.recordedAt)<lastTime
    ||pending.has(e.key)
    ||(e.side==="BUY"&&e.strategyReason!=="UPTREND_CONFIRMATION")
    ||(e.side==="SELL"&&e.strategyReason==="UPTREND_CONFIRMATION")
    ||e.decisionAt!==e.recordedAt
    ||e.researchSignalOnly!==true
    ||e.sourceRightsIndependentlyCertified!==false)reject("SIGNAL_INVALID_OR_LOOKAHEAD");
}
// Close an unusable historical pilot SIGNAL without rewriting its hash or
// faking a fill. Only the two independently audited EOD pilot venues may use
// this reason; a valid signal cannot be canceled by this recovery path.
function hasInvalidProspectivePilotWindow(signal){
  if(!signal||!["XMIL","XASX"].includes(signal.mic))return false;
  const check=auditOneGlobalEodPilotSignalWindow({
    mic:signal.mic,referenceSessionDate:signal.referenceSessionDate,
    referenceCloseAt:signal.referenceCloseAt,
    referencePublishedAt:signal.referencePublishedAt,recordedAt:signal.recordedAt,
  });
  return check.eligibleBySchedule===false;
}
function checkCancellation(e,ledger,pending){
  const signal=ledger.events.find(x=>x.kind==="SIGNAL"&&x.hash===e.signalHash);
  if(!signal||!pending.has(signal.key)||pending.get(signal.key)!==signal.hash
    ||e.key!==signal.key||e.mic!==signal.mic
    ||e.reason!=="INVALID_PROSPECTIVE_EOD_WINDOW"
    ||!hasInvalidProspectivePilotWindow(signal))
    reject("CANCELLATION_NOT_AUTHORIZED_OR_SIGNAL_NOT_PENDING");
  pending.delete(signal.key);
}
function quotePair(e){
  if(!Array.isArray(e.providerReceipts)||e.providerReceipts.length!==2)
    reject("TWO_PROVIDER_RECEIPTS_REQUIRED");
  const ids=new Set(),families=new Set();
  for(const q of e.providerReceipts){
    const id=family(q?.providerId),f=family(q?.sourceFamily);
    if(!id||!f||ids.has(id)||families.has(f)||q?.mic!==e.mic
      ||q?.key!==e.key||q?.currency!==e.currency
      ||q?.sessionDate!==e.sessionDate
      ||!sha(q?.payloadSha256)||!goodNumber(q?.close)
      ||stamp(q?.publishedAt)===null
      ||stamp(q.publishedAt)<stamp(e.sessionClosedAt)
      ||stamp(q.publishedAt)>stamp(e.recordedAt)
      ||stamp(q.publishedAt)-stamp(e.sessionClosedAt)>48*3600000
      ||q?.simulatedOrSynthetic!==false)
      reject("INDEPENDENT_RECEIPT_INVALID");
    ids.add(id);families.add(f);
  }
  const mid=(e.providerReceipts[0].close+e.providerReceipts[1].close)/2;
  if(e.providerReceipts.some(q=>Math.abs(q.close/mid-1)>.005))
    reject("INDEPENDENT_CLOSE_DIVERGENCE");
  return {mid,ids};
}
function checkRights(e,ids){
  if(!Array.isArray(e.ownerReviewedRights)||e.ownerReviewedRights.length!==2)
    reject("LICENSE_EVIDENCE_MISSING");
  const covered=new Set();
  for(const p of e.ownerReviewedRights){
    const id=family(p?.providerId);
    if(!id||!ids.has(id)||covered.has(id)||!sha(p?.evidenceSha256)
      ||p?.mic!==e.mic||p?.currency!==e.currency
      ||p?.usageScope!=="PRIVATE_PERSONAL_PAPER_SIMULATION"
      ||p?.reviewedByOwner!==true||p?.automatedUseAllowed!==true
      ||stamp(p?.validUntil)===null||stamp(p.validUntil)<=stamp(e.recordedAt)
      ||stamp(p.validUntil)-stamp(e.recordedAt)>366*86400000)
      reject("UNREVIEWED_OR_MISMATCHED_PROVIDER_RIGHTS");
    covered.add(id);
  }
}
function checkFx(e,decisionAt){
  if(e.currency==="EUR"){
    if(e.fxRateToEuro!==1||e.fxSource!=="EUR"
      ||e.fxReferenceDate!==null||e.fxPublishedAt!==null
      ||e.fxUnitsPerEuro!==null||e.fxSeries!==null
      ||e.fxUnitCurrency!==null)
      reject("EUR_FX_INVALID");
  }else if(!goodNumber(e.fxRateToEuro)||e.fxRateToEuro>100
    ||!goodNumber(e.fxUnitsPerEuro)||e.fxUnitsPerEuro>1e6
    ||e.fxUnitCurrency!==e.currency
    ||e.fxSeries!=="EXR.D."+e.currency+".EUR.SP00.A"
    ||Math.abs(e.fxRateToEuro*e.fxUnitsPerEuro-1)>1e-8
    ||e.fxSource!=="ECB_REFERENCE_ONLY"
    ||!day(e.fxReferenceDate)||e.fxReferenceDate>=e.sessionDate
    ||dailyDistance(e.fxReferenceDate,e.sessionDate)>7
    ||stamp(e.fxPublishedAt)===null||stamp(e.fxPublishedAt)>stamp(e.recordedAt)
    ||stamp(e.fxPublishedAt)<Date.parse(e.fxReferenceDate+"T00:00:00Z"))
    reject("EOD_FX_REFERENCE_MISSING_OR_FUTURE");
}
function applyFill(e,signal,state,pending,turnover){
  if(!signal||!pending.has(signal.key)||pending.get(signal.key)!==signal.hash)
    reject("SIGNAL_NOT_OPEN");
  if(e.key!==signal.key||e.side!==signal.side||e.mic!==signal.mic
    ||e.currency!==signal.currency||e.signalHash!==signal.hash
    ||!day(e.sessionDate)||e.sessionDate<=signal.referenceSessionDate
    ||dailyDistance(signal.referenceSessionDate,e.sessionDate)>14
    ||stamp(e.sessionOpenedAt)===null||stamp(e.sessionClosedAt)===null
    ||stamp(e.sessionOpenedAt)>=stamp(e.sessionClosedAt)
    ||venueDate(e.sessionOpenedAt,e.mic)!==e.sessionDate
    ||venueDate(e.sessionClosedAt,e.mic)!==e.sessionDate
    ||stamp(signal.recordedAt)>=stamp(e.sessionOpenedAt)
    ||stamp(e.sessionClosedAt)>stamp(e.recordedAt)
    ||stamp(e.recordedAt)-stamp(e.sessionClosedAt)>48*3600000
    ||e.simulatedExecutionMethod!=="NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT"
    ||e.paperCertificationCredit!==0||e.syntheticBrokerFill!==true
    ||!sha(e.authoritySnapshotHash)||!goodNumber(e.quantity)
    ||!Number.isSafeInteger(Math.round(e.quantity*1e6))
    ||!goodNumber(e.unitPriceLocal)||!goodNumber(e.notionalEuro)
    ||!goodNumber(e.feeEuro)||e.slippageBps!==IMPACT_BPS)
    reject("EXECUTION_TIMING_OR_SHAPE_INVALID");
  const {mid,ids}=quotePair(e);
  checkRights(e,ids);
  checkFx(e,signal.decisionAt);
  if(Math.abs(e.unitPriceLocal-mid)>0.0001)reject("CLOSE_MEDIAN_MISMATCH");
  const fillUnit=mid*e.fxRateToEuro*(1+(e.side==="BUY"?1:-1)*IMPACT_BPS/10000);
  if(Math.abs(e.notionalEuro-amt(e.quantity*fillUnit))>0.00011
    ||Math.abs(e.feeEuro-Math.max(MIN_FEE_EURO,amt(e.notionalEuro*FEE_RATE)))>0.00011)
    reject("FEE_OR_SLIPPAGE_ACCOUNTING_INVALID");
  const pos=state.positions[e.key]||{quantity:0,costEuro:0};
  const cost=amt(e.notionalEuro+e.feeEuro);
  const gross=amt(e.notionalEuro-e.feeEuro);
  if(e.side==="BUY"){
    if(e.quantity*fillUnit<10||e.notionalEuro>signal.maxNotionalEuro+0.00011
      ||e.notionalEuro>MAX_POSITION_EURO+0.00011
      ||cost>state.cashEuro+0.00011||pos.quantity>0
      ||turnover+e.notionalEuro>MAX_TURNOVER_EURO+0.00011)
      reject("POSITION_LIMIT_OR_CASH_INVALID");
    state.cashEuro=amt(state.cashEuro-cost);
    state.positions[e.key]={quantity:e.quantity,costEuro:cost};
  }else{
    if(pos.quantity<=0||Math.abs(pos.quantity-e.quantity)>0.000001
      ||turnover+e.notionalEuro>MAX_TURNOVER_EURO+0.00011)
      reject("SELL_WITHOUT_MATCHING_POSITION");
    state.cashEuro=amt(state.cashEuro+gross);
    state.realizedNetEuro=amt(state.realizedNetEuro+gross-pos.costEuro);
    delete state.positions[e.key];
    state.closedVirtualRoundTrips++;
  }
  pending.delete(e.key);
  return turnover+e.notionalEuro;
}
export function replayOneGlobalEodPaperLedger(ledger){
  if(ledger?.version!==1||ledger.mode!==MODE||ledger.capitalEuro!==INITIAL_EURO
    ||ledger.paperScope!=="PRIVATE_FORWARD_SIMULATION_UNCERTIFIED"
    ||ledger.sourceRightsIndependentlyCertified!==false
    ||ledger.strategyPerformanceCertified!==false||!safeFlags(ledger)
    ||!Array.isArray(ledger.events)||ledger.events.length>10000)
    reject("LEDGER_SCHEMA_OR_SAFETY_INVALID");
  const state={cashEuro:INITIAL_EURO,positions:{},realizedNetEuro:0,closedVirtualRoundTrips:0};
  const pending=new Map(),seen=new Set();
  let prev="GENESIS",lastTime=0,turnoverDate="",turnover=0,buys=0,sells=0;
  for(let i=0;i<ledger.events.length;i++){
    const e=ledger.events[i],{hash:claimed,...body}=e||{};
    if(e?.seq!==i+1||e.prevHash!==prev||!sha(claimed)
      ||claimed!==hash(body)||!safeFlags(e)
      ||stamp(e.recordedAt)===null||stamp(e.recordedAt)<lastTime)
      reject("LEDGER_HASH_OR_CLOCK_INVALID");
    if(e.recordedAt.slice(0,10)!==turnoverDate){turnoverDate=e.recordedAt.slice(0,10);turnover=0;}
    if(e.kind==="SIGNAL"){
      checkSignal(e,lastTime,pending);
      if(seen.has(e.signalId)||typeof e.signalId!=="string"
        ||!/^[a-z0-9._-]{12,100}$/.test(e.signalId))
        reject("SIGNAL_IDENTIFIER_INVALID");
      seen.add(e.signalId);
      if(e.side==="SELL"&&!state.positions[e.key]?.quantity)
        reject("UNHELD_EXIT_SIGNAL");
      pending.set(e.key,e.hash);
    }else if(e.kind==="FILL"){
      const signal=ledger.events.find(x=>x.kind==="SIGNAL"&&x.hash===e.signalHash);
      turnover=applyFill(e,signal,state,pending,turnover);
      if(e.side==="BUY")buys++;else sells++;
    }else if(e.kind==="CANCEL"){
      checkCancellation(e,ledger,pending);
    }else reject("EVENT_KIND_INVALID");
    prev=e.hash;lastTime=stamp(e.recordedAt);
  }
  if(ledger.lastHash!==prev||ledger.cashEuro!==state.cashEuro
    ||!eq(ledger.positions,state.positions))reject("LEDGER_REPLAY_ACCOUNT_MISMATCH");
  return {valid:true,cashEuro:state.cashEuro,positions:state.positions,
    pendingSignals:[...pending.keys()].sort(),virtualBuys:buys,virtualSells:sells,
    closedVirtualRoundTrips:state.closedVirtualRoundTrips,realizedNetEuro:state.realizedNetEuro,
    certifiedClosedTrades:0,phase9Credit:0,liveTradingAllowed:false,
    brokerConnectivityAllowed:false,marketDataRightsIndependentlyCertified:false};
}
function append(ledger,kind,fields,nowIso){
  const e={seq:ledger.events.length+1,prevHash:ledger.lastHash,kind,recordedAt:nowIso,
    ...fields,phase9Credit:0,liveTradingAllowed:false,brokerConnectivityAllowed:false};
  ledger.events.push({...e,hash:hash(e)});
  ledger.lastHash=ledger.events.at(-1).hash;
}
export function recordOneGlobalEodSignal({previousLedger,nowIso,signal}){
  const ledger=structuredClone(previousLedger||newOneGlobalEodPaperLedger());
  const prior=replayOneGlobalEodPaperLedger(ledger);
  if(stamp(nowIso)===null||stamp(nowIso)<(stamp(ledger.events.at(-1)?.recordedAt)||0))
    reject("CLOCK_INVALID");
  if(!signal||signal.decisionAt!==nowIso)reject("DECISION_NOT_PROSPECTIVE");
  const fields={signalId:signal.signalId,key:signal.key,mic:signal.mic,
    side:signal.side,currency:signal.currency,decisionAt:nowIso,
    referenceSessionDate:signal.referenceSessionDate,
    referenceCloseAt:signal.referenceCloseAt,
    referencePublishedAt:signal.referencePublishedAt,
    sourceSnapshotHash:signal.sourceSnapshotHash,
    maxNotionalEuro:signal.maxNotionalEuro,
    strategyReason:signal.strategyReason,
    researchSignalOnly:true,sourceRightsIndependentlyCertified:false};
  if(prior.pendingSignals.includes(fields.key))reject("PENDING_SIGNAL_ALREADY_EXISTS");
  append(ledger,"SIGNAL",fields,nowIso);
  replayOneGlobalEodPaperLedger(ledger);
  return {ledger,signalHash:ledger.lastHash,certified:false,phase9Credit:0};
}
/**
 * Append-only, private remediation of an objectively invalid XMIL/XASX pilot
 * signal. Does not touch balances, prior events, quotes, rights or broker.
 * This is not an authority to abandon valid trades or synthesize a fill.
 */
export function cancelOneGlobalEodInvalidSignal({previousLedger,nowIso,signalHash}){
  const ledger=structuredClone(previousLedger);
  const prior=replayOneGlobalEodPaperLedger(ledger);
  if(stamp(nowIso)===null||stamp(nowIso)<(stamp(ledger.events.at(-1)?.recordedAt)||0))
    reject("CLOCK_INVALID");
  const signal=ledger.events.find(x=>x.kind==="SIGNAL"&&x.hash===signalHash);
  if(!signal||!prior.pendingSignals.includes(signal.key)
     ||!hasInvalidProspectivePilotWindow(signal))
    reject("INVALID_WINDOW_CANCELLATION_NOT_ALLOWED");
  append(ledger,"CANCEL",{
    signalHash:signal.hash,key:signal.key,mic:signal.mic,
    reason:"INVALID_PROSPECTIVE_EOD_WINDOW",
  },nowIso);
  const replay=replayOneGlobalEodPaperLedger(ledger);
  return {ledger,canceled:true,pendingSignals:replay.pendingSignals,
    certified:false,phase9Credit:0,liveTradingAllowed:false,
    brokerConnectivityAllowed:false};
}
export function settleOneGlobalEodSignal({previousLedger,nowIso,signalHash,marketEvidence,
  ownerReviewedRights,authority,fxEvidence}){
  const ledger=structuredClone(previousLedger);
  replayOneGlobalEodPaperLedger(ledger);
  if(stamp(nowIso)===null||stamp(nowIso)<(stamp(ledger.events.at(-1)?.recordedAt)||0))
    reject("CLOCK_INVALID");
  if(!validPrivateEodAuthority(authority,nowIso))
    reject("OWNER_VIRTUAL_PAPER_APPROVAL_REQUIRED");
  const signal=ledger.events.find(x=>x.kind==="SIGNAL"&&x.hash===signalHash);
  if(!signal||!marketEvidence||!Array.isArray(marketEvidence.providerReceipts))
    reject("SOURCE_OR_PENDING_SIGNAL_MISSING");
  // At settlement, independently re-check the original timing of the first
  // two pilots. Never rewrite or invalidate an existing private SIGNAL, but
  // reject a retroactive EOD fill for an intraday/late decision. Holiday
  // exceptions require separate exchange-calendar evidence, not assumptions.
  if(signal.mic==="XMIL"||signal.mic==="XASX"){
    const window=auditOneGlobalEodPilotSignalWindow({
      mic:signal.mic,referenceSessionDate:signal.referenceSessionDate,
      referenceCloseAt:signal.referenceCloseAt,
      referencePublishedAt:signal.referencePublishedAt,recordedAt:signal.recordedAt,
    });
    if(!window.eligibleBySchedule)reject("SIGNAL_OUTSIDE_PROSPECTIVE_EOD_WINDOW");
  }
  const receipts=marketEvidence.providerReceipts.map(q=>({...q}));
  if(receipts.length!==2)reject("TWO_PROVIDER_RECEIPTS_REQUIRED");
  const middle=(Number(receipts[0].close)+Number(receipts[1].close))/2;
  const fx=signal.currency==="EUR"
    ?{rateToEuro:1,source:"EUR",referenceDate:null,publishedAt:null,
      unitsPerEuro:null,series:null,currency:null}
    :fxEvidence;
  if(!fx)reject("FX_REFERENCE_REQUIRED");
  const unit=middle*fx.rateToEuro*(1+(signal.side==="BUY"?1:-1)*IMPACT_BPS/10000);
  let qty;
  const pos=ledger.positions[signal.key];
  if(signal.side==="BUY"){
    const desired=Math.min(signal.maxNotionalEuro,MAX_POSITION_EURO,ledger.cashEuro-MIN_FEE_EURO);
    qty=floorShares(desired/unit);
  }else qty=pos?.quantity||0;
  if(!goodNumber(qty)||!Number.isFinite(unit)||unit<=0)reject("NO_FEASIBLE_VIRTUAL_QUANTITY");
  const notionalEuro=amt(qty*unit);
  const feeEuro=Math.max(MIN_FEE_EURO,amt(notionalEuro*FEE_RATE));
  append(ledger,"FILL",{
    signalHash,key:signal.key,mic:signal.mic,side:signal.side,currency:signal.currency,
    sessionDate:marketEvidence.sessionDate,
    sessionOpenedAt:marketEvidence.sessionOpenedAt,
    sessionClosedAt:marketEvidence.sessionClosedAt,
    simulatedExecutionMethod:"NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT",
    providerReceipts:receipts,ownerReviewedRights,authoritySnapshotHash:hash(authority),
    unitPriceLocal:amt(middle),quantity:qty,slippageBps:IMPACT_BPS,
    fxRateToEuro:fx.rateToEuro,fxSource:fx.source,
    // Inversion sanity: keep the original ECB quote and its currency/series
    // in the private hash-chained event, not only the derived EUR amount.
    fxUnitsPerEuro:fx.unitsPerEuro,fxUnitCurrency:fx.currency,fxSeries:fx.series,
    fxReferenceDate:fx.referenceDate,fxPublishedAt:fx.publishedAt,
    notionalEuro,feeEuro,paperCertificationCredit:0,syntheticBrokerFill:true,
  },nowIso);
  // Replay is the only accountant, no mutable/unchecked price path.
  const state=replayProvisionalBeforeAccountCommit(ledger);
  ledger.cashEuro=state.cashEuro;
  ledger.positions=state.positions;
  const verified=replayOneGlobalEodPaperLedger(ledger);
  return {ledger,accounting:verified,certified:false,
    externalExecutionReceiptsCertified:false,phase9Credit:0};
}
// Replay derives monetary state without trusting caller-supplied balances.
// Only this private writer may use the scratch state; published ledgers are
// always checked by full replayOneGlobalEodPaperLedger.
function replayProvisionalBeforeAccountCommit(ledger){
  // The checker deliberately refuses forged balances, so reconstruct each
  // append-only prefix with account snapshots derived only from its event.
  const state={cashEuro:INITIAL_EURO,positions:{},realizedNetEuro:0,closedVirtualRoundTrips:0};
  const pending=new Map();let turnover=0,turnoverDate="";
  for(const e of ledger.events){
    if(e.recordedAt.slice(0,10)!==turnoverDate){turnover=0;turnoverDate=e.recordedAt.slice(0,10);}
    if(e.kind==="SIGNAL")pending.set(e.key,e.hash);
    else if(e.kind==="CANCEL")pending.delete(e.key);
    else if(e.kind==="FILL"){
      const signal=ledger.events.find(x=>x.kind==="SIGNAL"&&x.hash===e.signalHash);
      turnover=applyFill(e,signal,state,pending,turnover);
    }
  }
  return state;
}
export function summarizeOneGlobalEodPaper(ledger){
  const r=replayOneGlobalEodPaperLedger(ledger);
  return {mode:MODE,virtualBuys:r.virtualBuys,virtualSells:r.virtualSells,
    pendingSignals:r.pendingSignals.length,closedVirtualRoundTrips:r.closedVirtualRoundTrips,
    realizedNetEuro:r.realizedNetEuro,cashEuro:r.cashEuro,
    // Journal names/hashes alone are NOT independent provider attestation.
    strategyCertified:false,sourceRightsIndependentlyCertified:false,
    phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
}
