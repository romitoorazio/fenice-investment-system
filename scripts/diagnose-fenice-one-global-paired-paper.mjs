/** Read-only operational snapshot diagnosis. Never certifies or writes PAPER fills. */
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {readPairedEvidence} from "../lib/global/paired-evidence-store.mjs";
import {loadPairedPaperInputs} from "../lib/global/paired-paper-input-gate.mjs";

export async function diagnosePairedPaper({directory,nowIso=new Date().toISOString()}) {
  const snapshot=await readPairedEvidence({directory,nowIso});
  if(!snapshot.accepted)return {mode:"READ_ONLY_PAPER_DIAGNOSTIC",certified:false,ready:false,reason:snapshot.reason,runId:null,observations:0,qualifiedSymbols:[]};
  const gate=await loadPairedPaperInputs({directory,nowIso});
  return {mode:"READ_ONLY_PAPER_DIAGNOSTIC",certified:false,ready:false,
    reason:gate.reason,runId:snapshot.runId,
    observations:Array.isArray(snapshot.quotes?.observations)?snapshot.quotes.observations.length:0,
    qualifiedSymbols:gate.qualifiedSymbols??[]};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const directory=process.argv[2];
  if(!directory){console.error("Usage: node scripts/diagnose-fenice-one-global-paired-paper.mjs <snapshot-directory>");process.exitCode=2;}
  else {const result=await diagnosePairedPaper({directory});console.log(JSON.stringify(result,null,2));}
}
