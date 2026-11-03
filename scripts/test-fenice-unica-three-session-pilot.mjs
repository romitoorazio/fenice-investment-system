import assert from "node:assert/strict";
import { SESSIONS, evaluateThreeSessionPilot } from "./check-fenice-unica-three-session-pilot.mjs";
import { PINNED_V8_FILES } from "./run-v8-technical-evidence.mjs";

const pinnedBlobs=Object.fromEntries(PINNED_V8_FILES.map(path=>[path,"b".repeat(40)]));
const approval={
  approved:true,humanConfirmation:true,approvalStatus:"ACTIVE_PINNED_PAPER_ONLY",
  mode:"PAPER_TECHNICAL_V8",prospectiveOnly:true,allowBackfill:false,
  minCalendarDays:30,minEvidenceDays:25,minTechnicalSamples:10,
  maxTechnicalSamples:10,minIndependentSourceFamilies:2,
  creditTowardV6:false,creditTowardB2:false,
  liveTradingAllowed:false,brokerConnectivityAllowed:false,
  autoEnableLiveTrading:false,paidServicesAuthorized:false,
  baselineCommit:"a".repeat(40),
  effectiveFrom:"2026-11-03T19:49:29.150Z",
  expiresAt:"2027-01-02T19:49:29.150Z",
  coreFileBlobs:pinnedBlobs,
};

const dateRecord=date=>({
  date,certificationScope:"V8_TECHNICAL_ONLY",
  liveTradingAllowed:false,brokerConnectivityAllowed:false,
});
const sample=date=>({
  occurredAt:date+"T19:30:00.000Z",status:"SIMULATED_EXECUTION",
  simulated:true,certificationCredit:0,
  liveTradingAllowed:false,brokerConnectivityAllowed:false,
});
const fixture=(dates=SESSIONS)=>({
  v8Approval:structuredClone(approval),
  observedCoreBlobs:{...pinnedBlobs},
  audit:{
    issues:[],
    safeguards:{
      liveTradingAllowed:false,brokerConnectivityAllowed:false,
      crossCampaignCredit:false,readOnly:true,
    },
    sourceClasses:{
      historicalV6:{independentlyScreenedOpenDays:22,strategyPaperFills:7},
      historicalV7PhaseB:{attempts:0},
      forwardB2:{attempts:0},
      technicalV8:{validDates:dates,simulatedTechnicalSamples:dates.length},
    },
  },
  v8Days:{records:dates.map(dateRecord)},
  v8Samples:{events:dates.map(sample)},
  nowIso:"2026-11-06T21:20:00.000Z",
});
assert.deepEqual(SESSIONS,["2026-11-04","2026-11-05","2026-11-06"]);
let report=evaluateThreeSessionPilot(fixture());
assert.equal(report.status,"PILOT_TECNICO_PASS");
assert.equal(report.passedSessions,3);
assert.equal(report.pinnedV8ApprovalVerified,true);
assert.equal(report.legacyEvidenceInventory.V6StrategyPaperFills,7);
assert.equal(report.certification.threeDayPilotIs30DayV8Certification,false);
assert.equal(report.certification.countsHistoricalFillsAsV8,false);
assert.equal(report.certification.investmentSignalQualityCertified,false);
assert.equal(report.safeguards.liveTradingAllowed,false);

report=evaluateThreeSessionPilot(fixture(SESSIONS.slice(0,2)));
assert.equal(report.status,"PILOT_TECNICO_INCOMPLETE");
assert.equal(report.passedSessions,2);
assert.equal(report.sessions.at(-1).state,"INCOMPLETE");

const early=fixture(SESSIONS.slice(0,1));
early.nowIso="2026-11-04T17:00:00.000Z";
report=evaluateThreeSessionPilot(early);
assert.equal(report.status,"COLLECTING");
assert.equal(report.sessions[0].state,"PASS");
assert.equal(report.sessions[1].state,"AWAITING_EVIDENCE");
assert.equal(report.sessions[2].state,"AWAITING_EVIDENCE");

const duplicate=fixture();
duplicate.v8Days.records.push(dateRecord(SESSIONS[0]));
report=evaluateThreeSessionPilot(duplicate);
assert.equal(report.status,"PILOT_TECNICO_INCOMPLETE");
assert.equal(report.passedSessions,2);
assert.equal(report.sessions[0].recordCount,2);

const noSample=fixture();
noSample.v8Samples.events.pop();
report=evaluateThreeSessionPilot(noSample);
assert.equal(report.status,"PILOT_TECNICO_INCOMPLETE");
assert.equal(report.passedSessions,2);

const unsafe=fixture();
unsafe.audit.safeguards.liveTradingAllowed=true;
report=evaluateThreeSessionPilot(unsafe);
assert.equal(report.status,"PILOT_TECNICO_INCOMPLETE");
assert(report.issues.includes("PILOT_SAFETY_POLICY_INVALID"));
assert.equal(report.passedSessions,0);

const changedPin=fixture();
changedPin.observedCoreBlobs[PINNED_V8_FILES[0]]="c".repeat(40);
report=evaluateThreeSessionPilot(changedPin);
assert.equal(report.passedSessions,0);
assert(report.issues.includes("V8_APPROVAL_POLICY_OR_PINNED_CORE_INVALID"));
assert.equal(report.pinnedV8ApprovalVerified,false);

const changedPolicy=fixture();
changedPolicy.v8Approval.minEvidenceDays=0;
report=evaluateThreeSessionPilot(changedPolicy);
assert.equal(report.passedSessions,0);
assert(report.issues.includes("V8_APPROVAL_POLICY_OR_PINNED_CORE_INVALID"));

const expired=fixture();
expired.v8Approval.expiresAt="2026-11-04T19:49:29.150Z";
report=evaluateThreeSessionPilot(expired);
assert.equal(report.passedSessions,0);
assert.equal(report.pinnedV8ApprovalVerified,false);

const backfill=fixture();
backfill.v8Approval.allowBackfill=true;
report=evaluateThreeSessionPilot(backfill);
assert.equal(report.passedSessions,0);

const unapproved=fixture();
unapproved.v8Approval.approved=false;
report=evaluateThreeSessionPilot(unapproved);
assert.equal(report.passedSessions,0);

const corrupt=fixture();
corrupt.audit.issues=["V8_SAMPLE_AUDIT_HASH_INVALID"];
report=evaluateThreeSessionPilot(corrupt);
assert.equal(report.status,"PILOT_TECNICO_INCOMPLETE");
assert.equal(report.passedSessions,0);

const historical=fixture([]);
historical.audit.sourceClasses.historicalV6.strategyPaperFills=27;
historical.audit.sourceClasses.technicalV8.simulatedTechnicalSamples=0;
report=evaluateThreeSessionPilot(historical);
assert.equal(report.passedSessions,0);
assert.equal(report.status,"PILOT_TECNICO_INCOMPLETE");

assert.throws(()=>evaluateThreeSessionPilot({...fixture(),nowIso:"nonsense"}),/PILOT_INVALID_CLOCK/);
console.log("Fenice Unica three-session read-only technical pilot: PASS");
console.log("No retrocredit, no LIVE, no approval to trade, no production dataset writes.");
