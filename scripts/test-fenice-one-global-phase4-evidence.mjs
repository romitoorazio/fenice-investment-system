import assert from "node:assert/strict";
import {assessPhase4ResearchEvidence} from "../lib/global/phase4-evidence-quality.mjs";
const evaluation={forward:{outcomes:[{mic:"XTKS"},{mic:"XMIL"},{mic:"XNAS"}]},summary:{stats:[{sessions:2,observed:3,pending:0},{sessions:5,observed:1,pending:2}]}};
const insufficient=assessPhase4ResearchEvidence({evaluation,minObservedPerHorizon:2,minVenues:3});
assert.equal(insufficient.sampleReady,false);assert.equal(insufficient.horizons[1].sufficient,false);
const sufficient=assessPhase4ResearchEvidence({evaluation:{...evaluation,summary:{stats:[{sessions:2,observed:3,pending:0},{sessions:5,observed:3,pending:0}]}},minObservedPerHorizon:2,minVenues:3});
assert.equal(sufficient.sampleReady,true);assert.equal(sufficient.realPaperCertified,false);assert.equal(sufficient.liveTradingAllowed,false);
assert.throws(()=>assessPhase4ResearchEvidence({evaluation,minObservedPerHorizon:0}),/INVALID_PHASE4_EVIDENCE/);
console.log("FENICE phase 4 research sample evidence gate: PASS");
