/** Phase 4 signal journal file adapter. Local file is only durable when runner storage is persisted. */
import {readFile,writeFile,mkdir,rename} from "node:fs/promises";
import {dirname} from "node:path";
import {appendPhase4Signals} from "./phase4-signal-journal.mjs";
export async function persistPhase4SignalJournal({path,candidates=[],capturedAt=new Date().toISOString()}={}){
 if(typeof path!=="string"||!path.endsWith(".json"))throw Error("INVALID_JOURNAL_PATH");
 let journal=[];
 try {
  const raw=await readFile(path,"utf8");
  const parsed=JSON.parse(raw);
  if(!Array.isArray(parsed.journal))throw Error("INVALID_EXISTING_JOURNAL");
  journal=parsed.journal;
 }catch(error){if(error?.code!=="ENOENT")throw error;}
 const result=appendPhase4Signals({journal,candidates,capturedAt});
 await mkdir(dirname(path),{recursive:true});
 const temp=`${path}.tmp-${process.pid}`;
 await writeFile(temp,JSON.stringify({schemaVersion:1,updatedAt:capturedAt,journal:result.journal,headHash:result.headHash},null,2)+"\n",{flag:"wx"});
 await rename(temp,path);
 return {appended:result.appended,duplicates:result.duplicates,total:result.journal.length,headHash:result.headHash};
}
