/** Isolated, opt-in paired snapshot store. Never mutates historical PAPER files. */
import {mkdir,readFile,writeFile,rename,rm,open} from "node:fs/promises";
import {join,resolve} from "node:path";
import {randomUUID} from "node:crypto";
import {snapshotDigest,verifyPairedEvidenceSnapshot} from "./paired-evidence-snapshot.mjs";
const readJson=async file=>JSON.parse(await readFile(file,"utf8"));
export async function publishPairedEvidence({directory,fx,quotes,nowIso=new Date().toISOString()}) {
  if(typeof directory!=="string"||!directory.trim())throw Error("SNAPSHOT_DIRECTORY_REQUIRED");
  const root=resolve(directory),runId=randomUUID(),publishedAt=nowIso;
  const manifest={version:1,runId,publishedAt,fxSha256:snapshotDigest(fx),quotesSha256:snapshotDigest(quotes)};
  const check=verifyPairedEvidenceSnapshot({fx,quotes,manifest,nowIso});
  if(!check.accepted)throw Error(check.reason);
  const runs=join(root,"runs"),stage=join(runs,"."+runId+".tmp"),final=join(runs,runId);
  await mkdir(runs,{recursive:true});
  await mkdir(stage);
  try {
    for(const [name,value] of [["fx.json",fx],["quotes.json",quotes],["manifest.json",manifest]]) {
      const handle=await open(join(stage,name),"wx",0o600);
      try{await handle.writeFile(JSON.stringify(value)+"\n");await handle.sync();}finally{await handle.close();}
    }
    await rename(stage,final);
  }catch(e){await rm(stage,{recursive:true,force:true});throw e;}
  // The pointer is published LAST. An interrupted run remains invisible to readers.
  const pointerTemp=join(root,".current-"+runId+".tmp"),pointer=join(root,"current.json");
  try {
    const handle=await open(pointerTemp,"wx",0o600);
    try{await handle.writeFile(JSON.stringify({runId})+"\n");await handle.sync();}finally{await handle.close();}
    await rename(pointerTemp,pointer);
    const dir=await open(root,"r");try{await dir.sync();}finally{await dir.close();}
  }finally{await rm(pointerTemp,{force:true});}
  return {runId,manifest};
}
export async function readPairedEvidence({directory,nowIso=new Date().toISOString()}) {
  try {
    const root=resolve(directory),pointer=await readJson(join(root,"current.json"));
    if(typeof pointer.runId!=="string"||!/^[a-f0-9-]{36}$/.test(pointer.runId))return {accepted:false,reason:"SNAPSHOT_POINTER_INVALID"};
    const dir=join(root,"runs",pointer.runId);
    const [fx,quotes,manifest]=await Promise.all(["fx.json","quotes.json","manifest.json"].map(name=>readJson(join(dir,name))));
    if(manifest.runId!==pointer.runId)return {accepted:false,reason:"SNAPSHOT_RUN_MISMATCH"};
    const result=verifyPairedEvidenceSnapshot({fx,quotes,manifest,nowIso});
    return result.accepted?{...result,fx,quotes,manifest}:result;
  }catch(e){if(e.code==="ENOENT"||e instanceof SyntaxError)return {accepted:false,reason:"SNAPSHOT_INCOMPLETE"};throw e;}
}
