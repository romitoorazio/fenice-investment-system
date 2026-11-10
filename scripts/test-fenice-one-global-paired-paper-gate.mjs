import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {publishPairedEvidence} from "../lib/global/paired-evidence-store.mjs";
import {loadPairedPaperInputs} from "../lib/global/paired-paper-input-gate.mjs";
const directory=await mkdtemp(join(tmpdir(),"fenice-paper-gate-"));
const nowIso="2026-11-10T10:00:30Z";
const fx={generatedAt:"2026-11-10T10:00:00Z",provenanceVerified:true,ratesToEuro:{EUR:{rate:1}},liveTradingAllowed:false};
const quotes={generatedAt:"2026-11-10T10:00:01Z",policy:{liveTradingAllowed:false},observations:[{symbol:"TEST",sourceFamily:"twelve-data",eligibility:"PAPER",price:10,provenanceVerified:true}]};
try {
  assert.equal((await loadPairedPaperInputs({directory,nowIso})).reason,"SNAPSHOT_INCOMPLETE");
  await publishPairedEvidence({directory,fx,quotes,nowIso});
  const unverified=await loadPairedPaperInputs({directory,nowIso});
  assert.equal(unverified.reason,"PAPER_INDEPENDENT_EXECUTABLE_QUORUM_MISSING");
  assert.equal(unverified.certificationCredit,0);
  const enhanced={...quotes,observations:[
    {symbol:"TEST",mic:"XMIL",instrumentId:"TEST",observedAt:"2026-11-10T10:00:00Z",sourceFamily:"source-a",verificationStatus:"INDEPENDENTLY_VERIFIED_EXECUTABLE_BID_ASK",executableBidAsk:true,provenanceVerified:true,bid:9,ask:10},
    {symbol:"TEST",mic:"XMIL",instrumentId:"TEST",observedAt:"2026-11-10T10:00:00Z",sourceFamily:"source-b",verificationStatus:"INDEPENDENTLY_VERIFIED_EXECUTABLE_BID_ASK",executableBidAsk:true,provenanceVerified:true,bid:9,ask:10},
  ]};
  await publishPairedEvidence({directory,fx,quotes:enhanced,nowIso});
  const quorum=await loadPairedPaperInputs({directory,nowIso});
  assert.equal(quorum.reason,"PAPER_VENUE_AND_FILL_ATTESTATION_REQUIRED");
  assert.equal(quorum.certificationCredit,0);
  assert.deepEqual(quorum.qualifiedSymbols,["XMIL:TEST"]);
  assert.equal((await loadPairedPaperInputs({directory,nowIso:"2026-11-10T10:05:00Z"})).reason,"SNAPSHOT_STALE");
  console.log("Paired PAPER fail-closed input gate: PASS (synthetic fixtures only)");
}finally{await rm(directory,{recursive:true,force:true});}
