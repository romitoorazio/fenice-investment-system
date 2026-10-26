/**
 * V7 Phase B forward PAPER-only probe cycle using V6-established quality,
 * provenance, FX, committee and venue gates. Separate ledger/campaign.
 * No broker imports, real money or LIVE. No V6 state imports or writes.
 */
import {createHash} from "node:crypto";
import {buildPaperValidationProbe} from "../../scripts/paper-validation-stager.mjs";
import {evaluateDecisionDataGate} from "./decision-data-gate.mjs";
import {evaluatePaperFxEvidence} from "./paper-fx-evidence.mjs";

const SHA=/^[a-f0-9]{64}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const round=n=>Math.round((n+Number.EPSILON)*10000)/10000;
const digest=o=>createHash("sha256").update(JSON.stringify(o)).digest("hex");
const time=s=>typeof s==="string"&&ISO.test(s)&&Number.isFinite(Date.parse(s))
  &&new Date(s).toISOString()===s?Date.parse(s):null;
const INIT=()=>({
  version:1,mode:"V7_PHASE_B_FORWARD_PAPER",virtualSeedEuro:10000,
  cashEuro:10000,positions:{},attempts:[],tip:"GENESIS",
  stopPermanently:false,brokerConnectivityAllowed:false,liveTradingAllowed:false,
});
export const freshV7PhaseBLedger=()=>INIT();
const fail=(reason,ledger)=>({
  state:"PHASE_B_NO_NEW_FILL",reason,ledger,
  newPaperFills:0,brokerConnectivityAllowed:false,liveTradingAllowed:false,
});
export function replayV7PhaseBLedger(ledger){
  const broken=reason=>({valid:false,reason});
  if(!ledger||ledger.version!==1||ledger.mode!=="V7_PHASE_B_FORWARD_PAPER"
    ||ledger.virtualSeedEuro!==10000||ledger.brokerConnectivityAllowed!==false
    ||ledger.liveTradingAllowed!==false||typeof ledger.stopPermanently!=="boolean"
    ||!Array.isArray(ledger.attempts)||ledger.attempts.length>20
    ||!ledger.positions||typeof ledger.positions!=="object"
    ||Array.isArray(ledger.positions))return broken("SCHEMA_INVALID");
  const ids=new Set(),dates=new Set(),p={};
  let tip="GENESIS",cash=10000,filled=0,last=-1;
  for(const e of ledger.attempts){
    if(!e||e.prevHash!==tip||e.hash!==digest(Object.fromEntries(
      Object.entries(e).filter(([k])=>k!=="hash")))
      ||e.mode!=="V7_PHASE_B_FORWARD_PAPER"
      ||e.brokerConnectivityAllowed!==false||e.liveTradingAllowed!==false
      ||typeof e.id!=="string"||ids.has(e.id)
      ||time(e.occurredAt)===null||time(e.occurredAt)<=last
      ||dates.has(e.occurredAt.slice(0,10))
      ||typeof e.instrumentKey!=="string"
      ||!SHA.test(e.evidenceSha256||"")
      ||!["PAPER_FILLED","PAPER_RISK_REJECTED"].includes(e.status)
      ||!(typeof e.notionalEuro==="number"&&Number.isFinite(e.notionalEuro))
      ||!(typeof e.feeEuro==="number"&&Number.isFinite(e.feeEuro)))
      return broken("AUDIT_HASH_TIME_OR_ID_INVALID");
    if(e.status==="PAPER_FILLED"){
      if(!(e.quantity>0&&Number.isFinite(e.quantity))
        ||!(e.unitPriceEuro>0&&Number.isFinite(e.unitPriceEuro))
        ||e.quantity>1e8||e.notionalEuro<250||e.notionalEuro>300
        ||e.feeEuro<1||e.feeEuro>5
        ||Math.abs(round(e.quantity*e.unitPriceEuro)-e.notionalEuro)>0.01
        ||e.notionalEuro>300||e.notionalEuro>10000*.03)
        return broken("FILL_RISK_OR_ARITHMETIC_INVALID");
      const pos=p[e.instrumentKey]||{quantity:0,bookCostEuro:0};
      const cost=round(e.notionalEuro+e.feeEuro);
      if(round(pos.bookCostEuro+cost)>1500+0.00001||cost>cash)
        return broken("ASSET_OR_CASH_CAP");
      p[e.instrumentKey]={quantity:round(pos.quantity+e.quantity),
        bookCostEuro:round(pos.bookCostEuro+cost)};
      cash=round(cash-cost);filled++;
    } else if(e.notionalEuro!==0||e.feeEuro!==0||e.quantity!==0
      ||typeof e.reason!=="string")
      return broken("REJECTION_INVALID");
    if(Math.abs(e.cashAfterEuro-cash)>0.00001
      ||JSON.stringify(e.positionsAfter)!==JSON.stringify(p))
      return broken("POST_EVENT_RECONCILIATION_FAILED");
    ids.add(e.id);dates.add(e.occurredAt.slice(0,10));
    last=time(e.occurredAt);tip=e.hash;
  }
  if(Math.abs(ledger.cashEuro-cash)>0.00001
    ||JSON.stringify(ledger.positions)!==JSON.stringify(p)
    ||ledger.tip!==tip)return broken("LEDGER_BALANCE_OR_TIP_INVALID");
  return {valid:true,attempts:ledger.attempts.length,fills:filled,
    cashEuro:cash,positions:p,tip};
}
export function runV7PhaseBForwardPaper({
  approval,expectedFingerprint,observedFingerprint,ledger,
  sourceHealth,intelligence,fxEvidence,marketSession,executionCoverage,
  terminal,committee,nowIso,
}={}){
  const observed=replayV7PhaseBLedger(ledger);
  if(!observed.valid)return fail("JOURNAL_INTEGRITY_BLOCK",ledger);
  const now=time(nowIso),start=time(approval?.approvedAt),expires=time(approval?.expiresAt);
  if(now===null||start===null||expires===null||now<start||now>=expires
    ||expires-start<30*86400000)return fail("APPROVAL_WINDOW_INVALID",ledger);
  if(approval?.approved!==true||approval?.humanConfirmation!==true
    ||approval?.mode!=="PAPER"||approval?.capitalEuro!==10000
    ||approval?.maxNotionalEuroPerOrder!==300
    ||approval?.maxCapitalPercentPerProbe!==3
    ||approval?.maxOrdersPerDay!==1||approval?.maxProbeAttemptsTotal!==20
    ||approval?.minTcaProbeNotionalEuro!==250
    ||approval?.maxSingleAssetWeightPercentForProbe!==15
    ||approval?.minCommitteeScore!==70
    ||approval?.minValidationDataConfidence!==90
    ||approval?.maxRiskScore!==75
    ||approval?.allowBackfill!==false
    ||approval?.v6HistoricalFillsCredited!==0
    ||approval?.brokerConnectivityAllowed!==false
    ||approval?.liveTradingAllowed!==false
    ||ledger.stopPermanently!==false)
    return fail("PHASE_B_SCOPE_OR_KILL_SWITCH_BLOCK",ledger);
  if(!expectedFingerprint||!SHA.test(expectedFingerprint.digest||"")
    ||observedFingerprint?.complete!==true
    ||observedFingerprint.digest!==expectedFingerprint.digest
    ||expectedFingerprint.complete!==true)
    return fail("PHASE_B_CORE_FINGERPRINT_NOT_PINNED",ledger);
  if(observed.attempts>=20||observed.fills>=10
    ||ledger.attempts.some(e=>e.occurredAt.slice(0,10)===nowIso.slice(0,10)))
    return fail("PHASE_B_LIMIT_OR_UTC_DAY_ALREADY_USED",ledger);

  const decision=evaluateDecisionDataGate({sourceHealth,intelligence,now});
  if(!decision.ready)return fail("FRESH_INSTITUTIONAL_DATA_NOT_ADMITTED",ledger);
  const fx=evaluatePaperFxEvidence({fxEvidence,approval,now});
  if(!fx.ready)return fail("FRESH_MARKET_FX_NOT_ADMITTED",ledger);
  if(executionCoverage?.policy?.liveTradingAllowed!==false
    ||!Array.isArray(executionCoverage.rows)
    ||!Number.isFinite(Date.parse(executionCoverage.generatedAt))
    ||now<Date.parse(executionCoverage.generatedAt)
    ||now-Date.parse(executionCoverage.generatedAt)>30*60000
    ||Number(executionCoverage.paperEligibleSymbols)<3
    ||Number(executionCoverage.policy?.minIndependentSourceFamilies)<2)
    return fail("FRESH_PAPER_EXECUTION_QUORUM_NOT_ADMITTED",ledger);
  if(marketSession?.evidence?.state!=="OPEN"
    ||marketSession?.evidence?.authoritative!==true
    ||marketSession?.configured!==true
    ||marketSession?.decision?.allowed!==true
    ||marketSession?.liveTradingAllowed!==false
    ||time(marketSession.evidence.observedAt)===null
    ||now<time(marketSession.evidence.observedAt)
    ||now-time(marketSession.evidence.observedAt)>120000)
    return fail("AUTHORITATIVE_MARKET_NOT_OPEN",ledger);
  if(!terminal||!committee)return fail("COMMITTEE_OR_TERMINAL_MISSING",ledger);
  // Reuse V6's already validated pure PAPER candidate stager without
  // touching V6 OMS, approval, queue or fingerprint.
  const virtualState={
    mode:"PAPER",liveTradingAllowed:false,brokerConnectivityAllowed:false,
    killSwitch:{engaged:false},reconciliation:{balanced:true,breaks:[]},
    executions:ledger.attempts.map(e=>({
      clientOrderId:e.id,validationProbe:true,createdAt:e.occurredAt,
      status:e.status,
    })),
    positions:Object.entries(ledger.positions).map(([id,p])=>({
      symbol:id.split(":")[1],quantity:p.quantity,fxToEuro:1,
    })),
  };
  const campaign={
    startedAt:approval.approvedAt,baselineCommit:expectedFingerprint.baselineCommit,
    baselineFingerprint:{complete:true},liveTradingAllowed:false,minPaperFills:10,
  };
  const t={...terminal,capitalEuro:10000};
  const runtimeApproval={...approval,riskFxToEuroByCurrency:{
    EUR:1,...(Number.isFinite(fx.metrics.usdRate)?{USD:fx.metrics.usdRate}:{})}};
  const candidate=buildPaperValidationProbe({
    campaign,approval:runtimeApproval,marketSession,coverage:executionCoverage,
    state:virtualState,queue:{mode:"PAPER",orders:[]},
    terminal:t,committee,now:nowIso,
  });
  if(candidate?.staged!==true||!candidate.order)
    return fail("V6_PARITY_DECISION_GATE_"+String(candidate?.reason||"NO_CANDIDATE"),ledger);
  const o=candidate.order,matching=executionCoverage.rows.find(r=>r.symbol===o.symbol);
  if(!matching||matching.paperEligible!==true
    ||!["GREEN","CAUTION"].includes(matching.state)
    ||Number(matching.independentSourceFamilies)<2
    ||typeof matching.medianPrice!=="number")
    return fail("CANDIDATE_MARKET_EVIDENCE_MISMATCH",ledger);
  const unitPriceEuro=round(matching.medianPrice*o.fxToEuro*1.0005);
  const maxSimulatedNotionalEuro=Math.min(300,10000*.03);
  const q=Math.floor(Math.min(Number(o.quantity),
    maxSimulatedNotionalEuro/unitPriceEuro)*1e6)/1e6;
  const notional=round(q*unitPriceEuro);
  const fee=Math.max(1,round(notional*.0015));
  const cost=round(notional+fee),id=o.symbol;
  const current=ledger.positions[id]||{quantity:0,bookCostEuro:0};
  if(!(q>0)||notional<250||notional>300
    ||notional>300||cost>ledger.cashEuro
    ||cost+current.bookCostEuro>1500)
    return fail("SIMULATED_FILL_RISK_OR_FRICTION_BLOCK",ledger);
  // Evidence receipt records only SHA-256; never store raw vendor quotes.
  const evidenceSha256=digest({
    coverageGeneratedAt:executionCoverage.generatedAt,fxGeneratedAt:fxEvidence.generatedAt,
    marketSessionAt:marketSession.evidence.observedAt,
    symbol:o.symbol,sourceFamilies:matching.sourceFamilies,
    price:matching.medianPrice,fxToEuro:o.fxToEuro,
  });
  const book={...ledger.positions,[id]:{
    quantity:round(current.quantity+q),bookCostEuro:round(current.bookCostEuro+cost),
  }};
  const body={
    prevHash:ledger.tip,id:o.clientOrderId,
    mode:"V7_PHASE_B_FORWARD_PAPER",occurredAt:nowIso,
    instrumentKey:id,status:"PAPER_FILLED",
    quantity:q,unitPriceEuro,notionalEuro:notional,feeEuro:fee,
    evidenceSha256,cashAfterEuro:round(ledger.cashEuro-cost),
    positionsAfter:book,brokerConnectivityAllowed:false,liveTradingAllowed:false,
  };
  const event={...body,hash:digest(body)};
  const updated={...ledger,cashEuro:body.cashAfterEuro,positions:book,
    attempts:[...ledger.attempts,event],tip:event.hash};
  if(!replayV7PhaseBLedger(updated).valid)
    return fail("POST_FILL_AUDIT_REPLAY_FAILED",ledger);
  return {
    state:"V7_PHASE_B_PAPER_FILL_RECORDED",reason:null,ledger:updated,
    newPaperFills:1,simulated:true,brokerConnectivityAllowed:false,liveTradingAllowed:false,
  };
}
