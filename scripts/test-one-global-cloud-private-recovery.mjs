import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newOneGlobalEodPaperLedger,replayOneGlobalEodPaperLedger} from '../lib/trading/one-global-eod-paper.mjs';
import {recoverOneGlobalOriginalPrivateEod as recover} from '../lib/trading/one-global-cloud-private-recovery.mjs';
const genesis=newOneGlobalEodPaperLedger();
const seedJson=JSON.stringify(genesis);
const options={expectedLastHash:'GENESIS',expectedEventCount:0};
function storage(existing=null){
 let data=existing,writes=0,reads=0,blockWrite=false;
 return {
  privateAccess:true,durable:true,
  get writes(){return writes;},get reads(){return reads;},
  get data(){return data;},
  block(){blockWrite=true;},
  async read(){reads++;return data===null?null:{etag:'"e1"',body:data};},
  async createIfAbsent(body){
   if(data!==null||blockWrite)throw Error('BlobAlreadyExistsError');
   data=body;writes++;return {created:true,etag:'"e1"'};
  }
 };
}
const first=storage();
const result=await recover({storage:first,seedJson,...options});
assert.equal(result.state,'ORIGINAL_JOURNAL_RECOVERED_PRIVATE');
assert.equal(result.originalOverwritten,false);
assert.equal(result.virtualFillsCreated,0);
assert.equal(result.journalEventCount,0);
assert.equal(result.liveTradingAllowed,false);
assert.equal(first.writes,1);
assert.equal(replayOneGlobalEodPaperLedger(JSON.parse(first.data)).valid,true);
const second=await recover({storage:first,seedJson,...options});
assert.equal(second.state,'EXISTING_ORIGINAL_NEVER_OVERWRITE');
assert.equal(first.writes,1,'second request must never overwrite');
assert.equal(result.phase9Credit,0);
const current=storage('{"private":"different original"}');
const blocked=await recover({storage:current,seedJson,...options});
assert.equal(blocked.state,'EXISTING_ORIGINAL_NEVER_OVERWRITE');
assert.equal(current.writes,0);
assert.equal(current.data,'{"private":"different original"}');
const raced=storage();
raced.block();
await assert.rejects(
 recover({storage:raced,seedJson,...options}),
 /CLOUD_PRIVATE_RECOVERY_PRIVATE_CREATE_REJECTED_OR_CONCURRENT/
);
assert.equal(raced.writes,0);
await assert.rejects(
 recover({storage:storage(),seedJson,...options,expectedLastHash:'f'.repeat(64)}),
 /CLOUD_PRIVATE_RECOVERY_RECOVERED_ORIGINAL_FINGERPRINT_MISMATCH/
);
await assert.rejects(
 recover({storage:storage(),seedJson}),
 /CLOUD_PRIVATE_RECOVERY_RECOVERED_ORIGINAL_FINGERPRINT_MISMATCH/,
 'production pinned historical tip MUST reject synthetic GENESIS'
);
await assert.rejects(
 recover({storage:storage(),seedJson:'{"bad":true}',...options}),
 /CLOUD_PRIVATE_RECOVERY_PRIVATE_ORIGINAL_SEED_INVALID/
);
await assert.rejects(
 recover({storage:{...storage(),privateAccess:false},seedJson,...options}),
 /CLOUD_PRIVATE_RECOVERY_AUTHENTICATED_CREATE_ONLY_PRIVATE_STORAGE_REQUIRED/
);
let readbackCalls=0;
const notYetReadable={
 privateAccess:true,durable:true,
 async read(){return ++readbackCalls===1?null:null;},
 async createIfAbsent(){return {created:true,etag:'"e1"'};},
};
const later=await recover({storage:notYetReadable,seedJson,...options});
assert.equal(later.state,'IMPORT_CREATED_READBACK_UNVERIFIED');
assert.equal(later.originalOverwritten,false);
const webRoute=readFileSync('app/api/paper/one-global-private-recover/route.js','utf8');
assert.match(webRoute,/export async function POST\(request\)/);
assert.match(webRoute,/feniceSameOrigin\(request\)/);
assert.match(webRoute,/verifyFeniceOwnerSession/);
assert.match(webRoute,/FENICE_ONE_GLOBAL_EOD_RECOVERY_JSON/);
assert.match(webRoute,/RECOVER_ORIGINAL_EOD_20261113/);
assert.doesNotMatch(webRoute,/export\s+(?:async\s+)?function\s+(?:GET|PUT|PATCH|DELETE)/);
assert.doesNotMatch(webRoute,/console\.(?:log|error)|newOneGlobalEodPaperLedger/);
const page=readFileSync('app/recupero-paper/page.tsx','utf8');
assert.match(page,/ORIGINAL_JOURNAL_NOT_MIGRATED/);
assert.match(page,/RECOVER_ORIGINAL_EOD_20261113/);
assert.match(page,/credentials:"same-origin"/);
assert.match(page,/disabled=\{submitting\}/);
console.log('PASS one-time private original EOD recovery: schema gate, exact tip, no overwrite, concurrency, readback and owner-only same-origin action. Synthetic fixture ONLY.');
