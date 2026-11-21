import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {persistPhase4SignalJournal} from "../lib/global/phase4-journal-file.mjs";
const dir=await mkdtemp(join(tmpdir(),"fenice-phase4-"));
const path=join(dir,"journal.json");
const signal={mic:"XTKS",instrumentId:"XTKS:7203",observedAt:"2026-11-10T10:00:00Z",score:2,dataVerified:false,executable:false};
try {
 const first=await persistPhase4SignalJournal({path,candidates:[signal],capturedAt:"2026-11-10T12:00:00Z"});
 assert.equal(first.total,1);assert.equal(first.appended,1);
 const replay=await persistPhase4SignalJournal({path,candidates:[signal],capturedAt:"2026-11-10T12:00:00Z"});
 assert.equal(replay.total,1);assert.equal(replay.duplicates,1);
 const file=JSON.parse(await readFile(path,"utf8"));
 file.headHash="wrong";
 await writeFile(path,JSON.stringify(file));
 await assert.rejects(()=>persistPhase4SignalJournal({path,candidates:[],capturedAt:"2026-11-10T12:00:00Z"}),/HEAD_MISMATCH/);
 file.headHash=first.headHash;
 file.journal[0].signal.score=999;
 await writeFile(path,JSON.stringify(file));
 await assert.rejects(()=>persistPhase4SignalJournal({path,candidates:[],capturedAt:"2026-11-10T12:00:00Z"}),/INTEGRITY_FAILURE/);
 console.log("FENICE phase 4 journal file persistence: PASS");
} finally {await rm(dir,{recursive:true,force:true});}
