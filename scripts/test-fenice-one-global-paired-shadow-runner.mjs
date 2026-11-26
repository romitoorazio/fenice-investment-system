import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {publishPairedEvidence} from "../lib/global/paired-evidence-store.mjs";
import {runPairedPaperShadow} from "../lib/global/paired-paper-shadow-runner.mjs";
const directory=await mkdtemp(join(tmpdir(),"fenice-shadow-"));
const nowIso="2026-11-10T10:00:30Z",ledger={fills:[]};
try {
  const empty=await runPairedPaperShadow({directory,ledger,nowIso});
  assert.equal(empty.added,false);
  assert.equal(empty.reason,"SNAPSHOT_INCOMPLETE");
  assert.equal(empty.ledger,ledger);
  const fx={generatedAt:"2026-11-10T10:00:00Z",provenanceVerified:true,ratesToEuro:{EUR:{rate:1}},liveTradingAllowed:false};
  const quotes={generatedAt:"2026-11-10T10:00:01Z",policy:{liveTradingAllowed:false},observations:[{symbol:"TEST",sourceFamily:"twelve-data",eligibility:"PAPER",price:10}]};
  await publishPairedEvidence({directory,fx,quotes,nowIso});
  const blocked=await runPairedPaperShadow({directory,ledger,nowIso,fill:{side:"BUY",price:10}});
  assert.equal(blocked.added,false);
  assert.equal(blocked.reason,"PAPER_INDEPENDENT_EXECUTABLE_QUORUM_MISSING");
  assert.equal(blocked.certificationCredit,0);
  assert.equal(blocked.ledger,ledger);
  console.log("Paired PAPER shadow runner fail-closed: PASS (synthetic fixtures only)");
}finally{await rm(directory,{recursive:true,force:true});}
