import assert from "node:assert/strict";
import {diagnose} from "./diagnose-paper-bottlenecks.mjs";
const x={committee:{generatedAt:"2026-11-05T12:00:00Z",topDecisions:[{symbol:"AAA",committeeScore:68,decision:"OSSERVA"}]},coverage:{generatedAt:"2026-11-05T12:00:00Z",rows:[{symbol:"AAA",paperEligible:false,independentSourceFamilies:1}]},terminal:{assets:[{symbol:"AAA",decision:"OSSERVA"}]},approval:{minCommitteeScore:70,permittedDecisionStates:["OSSERVA"]},days:{days:[{date:"2026-11-04",noNewFillReason:"NO_SIGNAL"}]},ledger:{attempts:[]}};
const r=diagnose(x,"2026-11-05T12:01:00Z");
assert.equal(r.counts.realStrategyPaperAttempts,0);
assert.deepEqual(r.rows[0].blockers,["NO_INDEPENDENT_QUOTE_QUORUM","SCORE_BELOW_APPROVED_MINIMUM"]);
assert.equal(r.freshness.coverageFreshForStager,true);
assert.equal(r.safeguards.liveTradingAllowed,false);
console.log("PAPER bottleneck diagnostic tests PASS");
