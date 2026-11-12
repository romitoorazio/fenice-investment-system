import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {diagnoseV8ProofRun,identifySafeSourceClues} from "./diagnose-v8-session-proof.mjs";

const run={id:43026283437,run_started_at:"2026-11-11T13:07:24Z",
  updated_at:"2026-11-11T13:09:52Z",conclusion:"success",
  html_url:"https://github.com/romitoorazio/fenice-investment-system/actions/runs/43026283437"};
const steps=(quote="skipped",gate="success",proof="skipped",persist="skipped")=>[
  {name:"Refuse duplicate sample before provider requests",conclusion:"success"},
  {name:"Verify session is OPEN, fresh and not near closing",conclusion:gate},
  {name:"Collect genuine, independent quote and FX evidence",conclusion:quote},
  {name:"Record V8 verified day or precise fail-closed diagnostic",conclusion:proof},
  {name:"Persist independent V8 and lab evidence even when V8 reports BLOCKED",conclusion:persist},
];
const input=(overrides={})=>({run,jobs:[{name:"observe",conclusion:"success",steps:steps()}],
  days:{records:[]},samples:{events:[]},status:{generatedAt:"2026-11-10T15:03:30.343Z",reason:null},
  integrityValid:true,log:"2026-11-11T13:09:48Z Fenice PAPER market session: CLOSED; allowed=false;",
  ...overrides});
const classify=x=>diagnoseV8ProofRun(input(x));
assert.equal(classify({}).status,"SESSION_GATE_BLOCKED");
assert.equal(classify({}).marketStateInJobLog,"CLOSED");
assert.equal(classify({}).newAdmissibleTechnicalDay,false);
assert.equal(classify({log:"Fenice PAPER market session: UNKNOWN"}).marketStateInJobLog,"UNKNOWN");
assert.equal(classify({jobs:[{name:"observe",conclusion:"success",steps:steps("skipped","skipped")}]})
  .status,"SESSION_CHECK_NOT_REACHED");
assert.equal(classify({jobs:[{name:"observe",conclusion:"success",steps:steps("failure")}]})
  .status,"SOURCE_COLLECTION_FAILED");
assert.equal(classify({jobs:[{name:"observe",conclusion:"success",steps:steps("success","success","failure")}]})
  .status,"V8_PROOF_VALIDATION_FAILED");
assert.equal(classify({jobs:[{name:"observe",conclusion:"failure",steps:steps("success","success","success","failure")}]})
  .status,"PROOF_PERSISTENCE_FAILED");
assert.equal(classify({status:{generatedAt:"2026-11-11T13:09:35.000Z",
  reason:"FRESH_DUAL_PROVIDER_OPEN_PROOF_MISSING"},
  jobs:[{name:"observe",conclusion:"success",steps:steps("success","success","success","success")}]})
  .stage,"FRESH_DUAL_PROVIDER_OPEN_PROOF_MISSING");
assert.equal(classify({status:{generatedAt:"2026-11-10T13:09:35.000Z",
  reason:"STORED_OLD_ERROR"},
  jobs:[{name:"observe",conclusion:"success",steps:steps("success","success","success","success")}]})
  .status,"NO_ADMISSIBLE_PROOF");
assert.equal(classify({integrityValid:false}).status,"EVIDENCE_INTEGRITY_FAILED");
assert.equal(classify({run:{...run,conclusion:"failure"},jobs:[{name:"observe",
  conclusion:"failure",steps:[{name:"Fake provider fail",conclusion:"failure"}]}]})
  .stage,"Fake provider fail");
const dateMatchedDay={records:[{date:"2026-11-11",
  observedAt:"2026-11-11T13:09:00.000Z"}]};
const fullSuccess={name:"observe",conclusion:"success",
  steps:steps("success","success","success","success")};
const admissible=classify({days:dateMatchedDay,jobs:[fullSuccess]});
assert.equal(admissible.status,"ADMISSIBLE_V8_TECHNICAL_DAY");
assert.equal(admissible.v8DayRecordedByThisRun,true);
const skippedObserver=classify({days:dateMatchedDay,
  jobs:[{name:"observe",conclusion:"skipped",steps:[]}]});
assert.equal(skippedObserver.newAdmissibleTechnicalDay,false,
  "A coincidental day in a regression-only run window is never attributed to skipped observer");
assert.equal(skippedObserver.v8DayRecordedByThisRun,false);
assert.equal(skippedObserver.status,"ALREADY_ADMITTED_TODAY");
const noQuoteCollection=classify({days:dateMatchedDay});
assert.equal(noQuoteCollection.newAdmissibleTechnicalDay,false);
assert.equal(noQuoteCollection.v8DayRecordedByThisRun,false);
const failedUpstream=classify({run:{...run,conclusion:"failure"},
  jobs:[fullSuccess],days:dateMatchedDay});
assert.equal(failedUpstream.newAdmissibleTechnicalDay,false);
const skippedPersistence=classify({days:dateMatchedDay,
  jobs:[{name:"observe",conclusion:"success",steps:steps("success","success","success","skipped")}]});
assert.equal(skippedPersistence.newAdmissibleTechnicalDay,false);

assert.equal(classify({days:{records:[{date:"2026-11-11",
  observedAt:"2026-11-11T12:11:00.000Z"}]}}).status,"ALREADY_ADMITTED_TODAY");
assert.equal(classify({samples:{events:[{occurredAt:"2026-11-11T13:09:00.000Z"}]}})
  .newAdmissibleTechnicalDay,false);
assert.deepEqual(identifySafeSourceClues("Error Twelve Data HTTP_429 token SECRET_HERE"),
  {families:["TWELVE_DATA"],errors:["RATE_LIMIT_OR_QUOTA"]});
assert.throws(()=>classify({run:{...run,run_started_at:"future"}}),/RUN_TIMESTAMPS_INVALID/);
const workflow=readFileSync(new URL("../.github/workflows/v8-shadow-exits.yml",import.meta.url),"utf8");
assert.match(workflow,/workflows:\s*\["Fenice Independent PAPER Execution Lab"\]/);
assert.match(workflow,/diagnose-v8-session-proof\.mjs/);
assert.match(workflow,/name: fenice-v8-session-proof-diagnostic/);
assert.match(workflow,/actions: read/);

assert.match(workflow,/needs: \[regression, diagnose-upstream-proof\]/,
  "virtual exit execution must require upstream lab proof classified by a separate read-only job");
assert.match(workflow,/needs\.diagnose-upstream-proof\.outputs\.new_admissible_day == 'true'/,
  "a green regression-only PAPER lab can never start a downstream virtual writer");
assert.match(workflow,/needs\.regression\.result == 'success'/,
  "regression must still pass for standalone scheduled/manual shadow cycles");
assert.match(workflow,/always\(\)/,
  "scheduled/manual virtual checks must not be suppressed by skipped upstream diagnostics");
assert.match(workflow,/new_admissible_day: \$\{\{ steps\.upstream_proof\.outputs\.new_admissible_day \}\}/,
  "upstream proof must be passed explicitly through authenticated job output");
assert.match(workflow,/r\.status==='ADMISSIBLE_V8_TECHNICAL_DAY'/,
  "only an actually persisted V8 technical day may unlock lab-triggered shadow computation");
assert.match(workflow,/r\.certificationCredit===0/,
  "V8 evidence must never be promoted into live or strategy certification");

assert.match(readFileSync(new URL("./diagnose-v8-session-proof.mjs",import.meta.url),"utf8"),/GITHUB_STEP_SUMMARY/);
const approval=JSON.parse(readFileSync(new URL("../data/paper-v8-technical-approval.json",import.meta.url),"utf8"));
assert(!Object.keys(approval.coreFileBlobs).includes(".github/workflows/v8-shadow-exits.yml"));
assert.equal(approval.liveTradingAllowed,false);
console.log("PASS V8 post-session blocker diagnoses: CLOSED vs source vs proof vs commit; no false PAPER credit, no Directa");
