import assert from "node:assert/strict";
import {summarizePhase4ForwardOutcomes} from "../lib/global/phase4-forward-summary.mjs";
const outcomes=[
 {results:[{sessions:2,status:"OBSERVED",returnPct:4},{sessions:5,status:"PENDING",returnPct:null}]},
 {results:[{sessions:2,status:"OBSERVED",returnPct:-2},{sessions:5,status:"OBSERVED",returnPct:0}]},
 {results:[{sessions:2,status:"PENDING",returnPct:null},{sessions:5,status:"PENDING",returnPct:null}]}
];
const r=summarizePhase4ForwardOutcomes({outcomes,horizons:[2,5,10]});
assert.deepEqual(r.stats[0],{sessions:2,observed:2,pending:1,wins:1,losses:1,flat:0,winRatePct:50,meanReturnPct:1});
assert.deepEqual(r.stats[1],{sessions:5,observed:1,pending:2,wins:0,losses:0,flat:1,winRatePct:0,meanReturnPct:0});
assert.equal(r.stats[2].winRatePct,null);assert.equal(r.stats[2].pending,3);
assert.equal(r.ordersGenerated,0);assert.equal(r.realPaperCertified,false);
assert.throws(()=>summarizePhase4ForwardOutcomes({outcomes:[{results:[{sessions:2,status:"OBSERVED",returnPct:NaN}]}],horizons:[2]}),/INVALID_PHASE4_OUTCOME/);
console.log("FENICE phase 4 matured forward summary: PASS");
