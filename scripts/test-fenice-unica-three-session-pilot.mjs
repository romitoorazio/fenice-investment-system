import assert from "node:assert/strict";
import { SESSIONS, evaluateThreeSessionPilot } from "./check-fenice-unica-three-session-pilot.mjs";

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
