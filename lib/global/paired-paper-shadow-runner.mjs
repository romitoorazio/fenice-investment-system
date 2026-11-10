/** Isolated ONE GLOBAL entrypoint: no broker, no persistent ledger writes. */
import {loadPairedPaperInputs} from "./paired-paper-input-gate.mjs";
import {runPaperShadow} from "./paper-shadow-pipeline.mjs";
export async function runPairedPaperShadow({directory,ledger,identity,calendarObservation,quotes,fxEvidence,fxObservations,fill,nowIso=new Date().toISOString()}) {
  const gate=await loadPairedPaperInputs({directory,nowIso});
  if(!gate.accepted)return {added:false,reason:gate.reason,ledger,certificationCredit:0};
  // Only future verified adapters may supply these independently attested inputs.
  // A paired provider snapshot alone must never bypass the venue/FX/fill gates.
  const result=runPaperShadow({ledger,identity,calendarObservation,quotes,fxEvidence,fxObservations,fill,nowIso});
  return {...result,certificationCredit:0};
}
