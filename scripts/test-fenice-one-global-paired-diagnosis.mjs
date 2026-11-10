import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {publishPairedEvidence} from "../lib/global/paired-evidence-store.mjs";
import {diagnosePairedPaper} from "./diagnose-fenice-one-global-paired-paper.mjs";
const directory=await mkdtemp(join(tmpdir(),"fenice-diagnose-"));
const nowIso="2026-11-10T10:00:30Z";
try {
  const empty=await diagnosePairedPaper({directory,nowIso});
  assert.equal(empty.ready,false);
  assert.equal(empty.certified,false);
  assert.equal(empty.reason,"SNAPSHOT_INCOMPLETE");
  const fx={generatedAt:"2026-11-10T10:00:00Z",provenanceVerified:true,ratesToEuro:{EUR:{rate:1}},liveTradingAllowed:false};
  const quotes={generatedAt:"2026-11-10T10:00:01Z",policy:{liveTradingAllowed:false},observations:[{symbol:"TEST",price:10,sourceFamily:"twelve-data"}]};
  await publishPairedEvidence({directory,fx,quotes,nowIso});
  const report=await diagnosePairedPaper({directory,nowIso});
  assert.equal(report.ready,false);
  assert.equal(report.certified,false);
  assert.equal(report.observations,1);
  assert.equal(report.reason,"PAPER_INDEPENDENT_EXECUTABLE_QUORUM_MISSING");
  assert.ok(report.runId);
  assert.deepEqual(report.qualifiedSymbols,[]);
  const stale=await diagnosePairedPaper({directory,nowIso:"2026-11-10T10:05:00Z"});
  assert.equal(stale.reason,"SNAPSHOT_STALE");
  assert.equal(stale.runId,null);
  console.log("ONE GLOBAL paired PAPER operational diagnosis: PASS (synthetic fixtures)");
}finally{await rm(directory,{recursive:true,force:true});}
