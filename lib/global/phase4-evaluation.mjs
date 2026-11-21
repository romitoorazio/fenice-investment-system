/** Phase 4 forward results from a frozen signal journal and later public histories. */
import {appendPhase4Signals} from "./phase4-signal-journal.mjs";
import {evaluatePhase4ForwardOutcomes} from "./phase4-forward-outcomes.mjs";
import {summarizePhase4ForwardOutcomes} from "./phase4-forward-summary.mjs";
export function buildPhase4ResearchEvaluation({journal=[],histories=[],nowIso=new Date().toISOString(),horizons=[2,5,10,40]}={}){
 const validated=appendPhase4Signals({journal,candidates:[],capturedAt:nowIso});
 const signals=validated.journal.map(row=>row.signal);
 for(const signal of signals){
  const captured=Date.parse(signal.capturedAt),observed=Date.parse(signal.observedAt);
  if(!Number.isFinite(captured)||captured<observed||captured>Date.parse(nowIso))throw Error("PHASE4_SIGNAL_CAPTURE_TIME_INVALID");
 }
 const forward=evaluatePhase4ForwardOutcomes({signals,histories,nowIso,horizons});
 for(const outcome of forward.outcomes){
  const signal=signals.find(s=>s.mic===outcome.mic&&s.instrumentId===outcome.instrumentId&&s.observedAt===outcome.signalAt);
  const captured=Date.parse(signal.capturedAt);
  for(const result of outcome.results){
   if(result.status==="OBSERVED"&&Date.parse(result.observedAt)<=captured)throw Error("PHASE4_LOOKAHEAD_DETECTED");
  }
 }
 const summary=summarizePhase4ForwardOutcomes({outcomes:forward.outcomes,horizons});
 return {schemaVersion:1,generatedAt:nowIso,mode:"PHASE4_UNATTESTED_RESEARCH_EVALUATION",journalEntries:signals.length,validatedHeadHash:validated.headHash,forward,summary,realPaperCertified:false,liveTradingAllowed:false,ordersGenerated:0};
}
