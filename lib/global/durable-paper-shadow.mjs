/** Opt-in bridge: validate a PAPER shadow fill before durable persistence. No broker I/O. */
import {runPaperShadow} from "./paper-shadow-pipeline.mjs";
import {loadDurableVirtualLedger,appendDurableVirtualFill} from "./durable-virtual-ledger.mjs";
import {classifyEvidenceBundle} from "./evidence-bundle.mjs";
export async function runDurablePaperShadow({file,...input}){
  const ledger=await loadDurableVirtualLedger(file);
  const result=runPaperShadow({...input,ledger});
  if(!result.added)return {...result,persisted:false};
  const classification=classifyEvidenceBundle(input);
  if(!classification.accepted)return {added:false,persisted:false,reason:classification.reason,ledger};
  // Real provider attestation is not yet verified: never credit a production PAPER fill.
  if(classification.classification!=="SYNTHETIC_TEST_ONLY")
    return {added:false,persisted:false,reason:"REAL_SOURCE_PAPER_NOT_CERTIFIED",ledger};
  const stored=await appendDurableVirtualFill({file,identity:input.identity,fill:input.fill,
    evidence:{allowed:true,venue:input.identity.mic,instrumentId:input.identity.instrumentId}});
  return {...stored,evidenceClassification:classification.classification,
    countsTowardRealPaper:false};
}
