/** Phase 4 forward results from a frozen signal journal and later public histories. */
import {appendPhase4Signals} from "./phase4-signal-journal.mjs";
import {evaluatePhase4ForwardOutcomes} from "./phase4-forward-outcomes.mjs";
import {summarizePhase4ForwardOutcomes} from "./phase4-forward-summary.mjs";
export function buildPhase4ResearchEvaluation({journal=[],histories=[],nowIso=new Date().toISOString(),horizons=[2,5,10,40]}={}){
 const validated=appendPhase4Signals({journal,candidates:[],capturedAt:nowIso});
 const signals=validated.journal.map(row=>row.signal);
 const forward=evaluatePhase4ForwardOutcomes({signals,histories,nowIso,horizons});
 const summary=summarizePhase4ForwardOutcomes({outcomes:forward.outcomes,horizons});
 return {schemaVersion:1,generatedAt:nowIso,mode:"PHASE4_UNATTESTED_RESEARCH_EVALUATION",journalEntries:signals.length,validatedHeadHash:validated.headHash,forward,summary,realPaperCertified:false,liveTradingAllowed:false,ordersGenerated:0};
}
