import assert from "node:assert/strict";
import {freshV7PhaseBLedger,replayV7PhaseBLedger,runV7PhaseBForwardPaper as cycle}
  from "../lib/trading/paper-v7-phase-b-v6-parity.mjs";
import {computeV7PhaseBFingerprint} from "../lib/trading/paper-v7-phase-b-forward-fingerprint.mjs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
const nowIso="2026-10-27T16:55:00.000Z",at=new Date(nowIso).getTime();
const offset=(secs)=>new Date(at-secs*1000).toISOString();
const sha="a".repeat(64),commit="a".repeat(40);
const fingerprint={complete:true,domain:"FENICE_V7_PHASE_B_FORWARD_CORE_V1",
  digest:sha,baselineCommit:commit};
const approval={
  approved:true,humanConfirmation:true,mode:"PAPER",capitalEuro:10000,
  approvedAt:"2026-10-27T00:00:00.000Z",expiresAt:"2026-11-27T00:00:00.000Z",
  maxNotionalEuroPerOrder:300,maxCapitalPercentPerProbe:3,
  maxOrdersPerDay:1,maxProbeAttemptsTotal:20,
  minTcaProbeNotionalEuro:250,maxSingleAssetWeightPercentForProbe:15,
  minCommitteeScore:70,minValidationDataConfidence:90,maxRiskScore:75,
  targetPaperFills:10,idPrefix:"fenice-v7-phase-b-2026-",
  brokerConnectivityAllowed:false,liveTradingAllowed:false,
  v6HistoricalFillsCredited:0,allowBackfill:false,
  permittedDecisionStates:["OSSERVA","MANTIENI","ACCUMULA"],
  permittedCurrencies:["EUR","USD"],
  fxPolicy:{baseCurrency:"EUR",provider:"twelve-data",
    requiredForNonEuro:true,maxAgeSeconds:120,
    allowedCurrencies:["EUR","USD"],usdPair:"USD/EUR"},
};
const base={
  nowIso,approval,expectedFingerprint:fingerprint,observedFingerprint:fingerprint,
  ledger:freshV7PhaseBLedger(),
  sourceHealth:{generatedAt:offset(30),
    critical:{gate:"GREEN",ready:9,total:9}},
  intelligence:{generatedAt:offset(20),intelligenceConfidence:94,
    coverage:{sourceConcentrationPercent:45,marketSources:3,
      assetClasses:["Equity","Bond","ETF"]},
    crossSourceValidation:{checked:20,divergent:0},
    policy:{unknownTimestampEvidenceExcluded:true,
      validationEvidenceFreshnessHours:{crypto:4,traditional:96}}},
  fxEvidence:{version:1,generatedAt:offset(15),provider:"twelve-data",
    provenanceVerified:true,baseCurrency:"EUR",maxAgeSeconds:120,
    ratesToEuro:{EUR:{rate:1,observedAt:offset(15),source:"identity"},
      USD:{rate:0.9,observedAt:offset(50),
        source:"Twelve Data /exchange_rate USD/EUR"}},
    liveTradingAllowed:false,brokerConnectivityAllowed:false},
  marketSession:{configured:true,evidence:{authoritative:true,
    state:"OPEN",observedAt:offset(20)},decision:{allowed:true},
    liveTradingAllowed:false},
  executionCoverage:{generatedAt:offset(80),paperEligibleSymbols:4,
    paperEligiblePercent:40,
    policy:{liveTradingAllowed:false,minIndependentSourceFamilies:2},
    rows:[{symbol:"SPY",paperEligible:true,state:"CAUTION",
      sourceFamilies:["alpaca","twelve-data"],
      independentSourceFamilies:2,medianPrice:200}]},
  terminal:{generatedAt:offset(160),capitalEuro:10000,
    assets:[{symbol:"SPY",currency:"USD",confidence:98,riskScore:30,
      decision:"ACCUMULA"}]},
  committee:{generatedAt:offset(110),sourceGate:"GREEN",dataQuality:98,
    topDecisions:[{symbol:"SPY",currency:"USD",decision:"OSSERVA",
      committeeScore:75,confidence:88,
      rawConfidenceBeforeCalibration:98,riskScore:30}]},
};
const result=cycle(base);
assert.equal(result.state,"V7_PHASE_B_PAPER_FILL_RECORDED",JSON.stringify(result));
assert.equal(result.newPaperFills,1);
assert.equal(result.ledger.mode,"V7_PHASE_B_FORWARD_PAPER");
assert.equal(result.ledger.attempts.length,1);
assert.equal(replayV7PhaseBLedger(result.ledger).valid,true);
assert.equal(result.liveTradingAllowed,false);
assert.equal(result.brokerConnectivityAllowed,false);
const e=result.ledger.attempts[0];
assert.equal(e.evidenceSha256.length,64);
assert.equal(e.mode,"V7_PHASE_B_FORWARD_PAPER");
assert.equal(e.status,"PAPER_FILLED");
assert(e.notionalEuro>=250&&e.notionalEuro<=300);
assert(e.feeEuro>=1);
assert(result.ledger.cashEuro<10000);
assert.equal(cycle({...base,ledger:result.ledger}).state,"PHASE_B_NO_NEW_FILL");
const negatives=[
  ["no owner",b=>b.approval.approved=false,"PHASE_B_SCOPE_OR_KILL_SWITCH_BLOCK"],
  ["LIVE leak",b=>b.approval.liveTradingAllowed=true,"PHASE_B_SCOPE_OR_KILL_SWITCH_BLOCK"],
  ["old fills credited",b=>b.approval.v6HistoricalFillsCredited=7,"PHASE_B_SCOPE_OR_KILL_SWITCH_BLOCK"],
  ["approval expires",b=>b.approval.expiresAt="2026-10-27T16:54:59.000Z","APPROVAL_WINDOW_INVALID"],
  ["shortened term",b=>b.approval.expiresAt="2026-11-02T00:00:00.000Z","APPROVAL_WINDOW_INVALID"],
  ["unbound fingerprint",b=>b.observedFingerprint.digest="b".repeat(64),
    "PHASE_B_CORE_FINGERPRINT_NOT_PINNED"],
  ["stale critical data",b=>b.sourceHealth.generatedAt=offset(900),
    "FRESH_INSTITUTIONAL_DATA_NOT_ADMITTED"],
  ["weak confidence",b=>b.intelligence.intelligenceConfidence=70,
    "FRESH_INSTITUTIONAL_DATA_NOT_ADMITTED"],
  ["stale FX",b=>b.fxEvidence.ratesToEuro.USD.observedAt=offset(900),
    "FRESH_MARKET_FX_NOT_ADMITTED"],
  ["unverified FX",b=>b.fxEvidence.provenanceVerified=false,
    "FRESH_MARKET_FX_NOT_ADMITTED"],
  ["single market provider",b=>b.executionCoverage.rows[0].independentSourceFamilies=1,
    "V6_PARITY_DECISION_GATE_no-eligible-validation-candidate"],
  ["no market",b=>b.marketSession.evidence.state="CLOSED",
    "AUTHORITATIVE_MARKET_NOT_OPEN"],
  ["no eligible source",b=>b.executionCoverage.rows[0].paperEligible=false,
    "V6_PARITY_DECISION_GATE_no-eligible-validation-candidate"],
  ["low committee score",b=>b.committee.topDecisions[0].committeeScore=45,
    "V6_PARITY_DECISION_GATE_no-eligible-validation-candidate"],
  ["insufficient terminal quality",b=>b.terminal.assets[0].confidence=30,
    "V6_PARITY_DECISION_GATE_no-eligible-validation-candidate"],
  ["stop forever",b=>b.ledger.stopPermanently=true,
    "PHASE_B_SCOPE_OR_KILL_SWITCH_BLOCK"],
];
for(const [name,mutate,reason]of negatives){
  const b=structuredClone(base);mutate(b);
  const got=cycle(b);
  assert.equal(got.state,"PHASE_B_NO_NEW_FILL",name);
  assert.equal(got.reason,reason,name+": "+got.reason);
  assert.equal(got.newPaperFills,0,name);
  assert.equal(got.ledger.attempts.length,0,name);
}
const altered=structuredClone(result.ledger);
altered.cashEuro+=100;
assert.equal(replayV7PhaseBLedger(altered).valid,false);
const rehashed=structuredClone(result.ledger);
rehashed.attempts[0].notionalEuro=400;
assert.equal(replayV7PhaseBLedger(rehashed).valid,false);
const fakeV6=structuredClone(result.ledger);
fakeV6.mode="PAPER_V6";
assert.equal(replayV7PhaseBLedger(fakeV6).valid,false);
assert.equal(freshV7PhaseBLedger().cashEuro,10000);
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const fingerprintActual=await computeV7PhaseBFingerprint(root);
assert.equal(fingerprintActual.complete,true,JSON.stringify(fingerprintActual.missingFiles));
assert.equal(fingerprintActual.files.includes("data/paper-validation-campaign.json"),false);
assert.equal(fingerprintActual.files.includes("data/paper-v7-phase-b-forward-ledger.json"),false);
console.log("V7 Phase B forward V6-parity PAPER: PASS (strict consent, FX, sources, risk, audit and no LIVE)");
