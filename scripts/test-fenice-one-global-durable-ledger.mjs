import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,writeFile,open} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {appendDurableVirtualFill,loadDurableVirtualLedger} from "../lib/global/durable-virtual-ledger.mjs";
import {replayVirtualLedger} from "../lib/global/virtual-ledger.mjs";
const dir=await mkdtemp(join(tmpdir(),"fenice-global-ledger-")),file=join(dir,"paper.json");
const identity={campaignId:"synthetic-contract",mic:"XTKS",instrumentId:"XTKS:7203",sessionDate:"2026-11-06",strategyVersion:"v1",signalId:"s1"};
const fill={occurredAt:"2026-11-06T01:30:00.000Z",side:"BUY",price:100,quantity:2,fees:1,fxToEur:.006};
const evidence={allowed:true,venue:"XTKS",instrumentId:"XTKS:7203"};
try{
 assert.equal((await loadDurableVirtualLedger(file)).events.length,0);
 const one=await appendDurableVirtualFill({file,identity,fill,evidence});
 assert.equal(one.added,true);assert.equal(one.persisted,true);
 assert.equal(replayVirtualLedger(await loadDurableVirtualLedger(file)).count,1);
 const duplicate=await appendDurableVirtualFill({file,identity,fill,evidence});
 assert.equal(duplicate.added,false);assert.equal(duplicate.persisted,true);
 assert.equal(duplicate.reason,"DUPLICATE_PAPER_SIGNAL");
 const beforeConflict=await readFile(file,"utf8");
 const conflict=await appendDurableVirtualFill({file,identity,fill:{...fill,quantity:99},evidence});
 assert.equal(conflict.added,false);assert.equal(conflict.persisted,false);
 assert.equal(conflict.reason,"PAPER_SIGNAL_IDEMPOTENCY_CONFLICT");
 assert.equal(await readFile(file,"utf8"),beforeConflict,"A conflicting retry must leave the file unchanged");
 assert.equal((await loadDurableVirtualLedger(file)).events.length,1);
 const lock=await open(file+".lock","wx");
 try{await assert.rejects(appendDurableVirtualFill({file,identity:{...identity,signalId:"s2"},fill,evidence}),/LEDGER_BUSY/);}
 finally{await lock.close();await rm(file+".lock");}
 const second=await appendDurableVirtualFill({file,identity:{...identity,signalId:"s2"},fill,evidence});
 assert.equal(second.added,true);assert.equal((await loadDurableVirtualLedger(file)).events.length,2);
 const raw=JSON.parse(await readFile(file,"utf8"));raw.events[0].price=999;
 await writeFile(file,JSON.stringify(raw));
 await assert.rejects(loadDurableVirtualLedger(file),/LEDGER_HASH_INVALID/);
 await assert.rejects(appendDurableVirtualFill({file,identity:{...identity,signalId:"s3"},fill,evidence}),/LEDGER_HASH_INVALID/);
}finally{await rm(dir,{recursive:true,force:true});}
console.log("Fenice ONE GLOBAL durable virtual ledger contracts: PASS");
