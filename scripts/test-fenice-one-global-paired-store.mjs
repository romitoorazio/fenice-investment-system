import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,rm,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {publishPairedEvidence,readPairedEvidence} from "../lib/global/paired-evidence-store.mjs";
const root=await mkdtemp(join(tmpdir(),"fenice-paired-"));
const nowIso="2026-11-10T10:00:30Z";
const fx={generatedAt:"2026-11-10T10:00:00Z",liveTradingAllowed:false,ratesToEuro:{USD:{rate:0.9}}};
const quotes={generatedAt:"2026-11-10T10:00:01Z",policy:{liveTradingAllowed:false},observations:[]};
try {
  assert.equal((await readPairedEvidence({directory:root,nowIso})).reason,"SNAPSHOT_INCOMPLETE");
  const first=await publishPairedEvidence({directory:root,fx,quotes,nowIso});
  assert.equal((await readPairedEvidence({directory:root,nowIso})).runId,first.runId);
  // Simulate a crash after a complete staged run but before pointer publication.
  await mkdir(join(root,"runs","orphan"),{recursive:true});
  assert.equal((await readPairedEvidence({directory:root,nowIso})).runId,first.runId);
  const nextFx={...fx,ratesToEuro:{USD:{rate:0.91}}};
  const second=await publishPairedEvidence({directory:root,fx:nextFx,quotes,nowIso});
  assert.notEqual(second.runId,first.runId);
  assert.equal((await readPairedEvidence({directory:root,nowIso})).fx.ratesToEuro.USD.rate,0.91);
  await writeFile(join(root,"runs",second.runId,"fx.json"),JSON.stringify(fx));
  assert.equal((await readPairedEvidence({directory:root,nowIso})).reason,"SNAPSHOT_DIGEST_MISMATCH");
  assert.equal((await readPairedEvidence({directory:root,nowIso:"2026-11-10T10:05:00Z"})).reason,"SNAPSHOT_DIGEST_MISMATCH");
  const pointer=JSON.parse(await readFile(join(root,"current.json"),"utf8"));
  assert.equal(pointer.runId,second.runId);
  console.log("Paired snapshot store crash and tamper regression: PASS (synthetic only)");
}finally{await rm(root,{recursive:true,force:true});}
