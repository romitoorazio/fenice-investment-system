/** Isolated ONE GLOBAL entrypoint: no broker, no persistent ledger writes. */
import {loadPairedPaperInputs} from "./paired-paper-input-gate.mjs";
import {runPaperShadow} from "./paper-shadow-pipeline.mjs";
import {readPairedEvidence} from "./paired-evidence-store.mjs";
export async function runPairedPaperShadow({directory,ledger,identity,calendarObservation,quotes,fxEvidence,fxObservations,fill,nowIso=new Date().toISOString()}) {
  const gate=await loadPairedPaperInputs({directory,nowIso});
  if(!gate.accepted)return {added:false,reason:gate.reason,ledger,certificationCredit:0};
  // Bind any caller-supplied quote to the exact instrument and venue admitted by the paired gate.
  // This is defense in depth: an independently qualified snapshot cannot authorize a different instrument.
  const qualifiedKey=`${identity?.mic}:${identity?.instrumentId}`;
  if(!Array.isArray(gate.qualifiedSymbols)||!gate.qualifiedSymbols.includes(qualifiedKey))
    return {added:false,reason:"PAPER_SNAPSHOT_INSTRUMENT_MISMATCH",ledger,certificationCredit:0};
  // A caller cannot substitute more favorable quotes after the snapshot gate qualifies a symbol.
  // Re-read the immutable run and fail closed if the current pointer changed meanwhile.
  const snapshot=await readPairedEvidence({directory,nowIso});
  if(!snapshot.accepted||snapshot.runId!==gate.runId)
    return {added:false,reason:"PAPER_SNAPSHOT_CHANGED",ledger,certificationCredit:0};
  const attested=snapshot.quotes.observations.filter(q=>q?.mic===identity.mic&&q?.instrumentId===identity.instrumentId&&q?.verificationStatus==="INDEPENDENTLY_VERIFIED_EXECUTABLE_BID_ASK"&&q?.executableBidAsk===true&&q?.provenanceVerified===true);
  if(!Array.isArray(quotes)||quotes.length!==attested.length||!quotes.every(q=>attested.some(a=>JSON.stringify(a)===JSON.stringify(q))))
    return {added:false,reason:"PAPER_SNAPSHOT_QUOTES_MISMATCH",ledger,certificationCredit:0};
  // Only future verified adapters may supply these independently attested inputs.
  // A paired provider snapshot alone must never bypass the venue/FX/fill gates.
  const result=runPaperShadow({ledger,identity,calendarObservation,quotes,fxEvidence,fxObservations,fill,nowIso});
  return {...result,certificationCredit:0};
}
