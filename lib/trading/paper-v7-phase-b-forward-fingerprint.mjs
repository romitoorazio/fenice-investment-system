import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve,sep} from "node:path";

// Frozen V7 Phase B risk/execution core. Never include dynamic ledger or
// approval (which pins this digest); these are verified separately. Changing
// any source file requires new prospectively approved baseline and campaign.
export const V7_PHASE_B_CORE_FILES=[
  ".github/workflows/v7-phase-b-forward-paper.yml",
  "lib/trading/decision-data-gate.mjs",
  "lib/trading/paper-fx-evidence.mjs",
  "lib/trading/paper-v7-phase-b-v6-parity.mjs",
  "lib/trading/paper-v7-phase-b-forward-fingerprint.mjs",
  "scripts/paper-validation-stager.mjs",
  "scripts/run-v7-phase-b-forward-cycle.mjs",
  "scripts/test-v7-phase-b-forward-paper.mjs",
].sort();
export async function computeV7PhaseBFingerprint(root){
  const h=createHash("sha256");
  h.update("FENICE_V7_PHASE_B_FORWARD_CORE_V1\n");
  const missing=[];
  for(const p of V7_PHASE_B_CORE_FILES){
    const abs=resolve(root,p);
    if(!abs.startsWith(resolve(root)+sep))throw Error("V7_PHASE_B_FINGERPRINT_PATH_ESCAPE");
    h.update("FILE:"+p+"\n");
    try{h.update((await readFile(abs,"utf8")).replace(/\r\n/g,"\n"))}
    catch(e){if(e.code!=="ENOENT")throw e;missing.push(p);h.update("<MISSING>")}
    h.update("\nEND_FILE\n");
  }
  return {
    algorithm:"sha256",domain:"FENICE_V7_PHASE_B_FORWARD_CORE_V1",
    digest:h.digest("hex"),complete:missing.length===0,
    missingFiles:missing,files:V7_PHASE_B_CORE_FILES,
  };
}
