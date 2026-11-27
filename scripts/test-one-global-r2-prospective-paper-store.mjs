import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProspectiveR2PaperStore} from '../lib/trading/one-global-r2-prospective-paper-store.mjs';
import {recordOneGlobalEodSignal} from '../lib/trading/one-global-eod-paper.mjs';
const objects=new Map();let version=0;
const transport=async ({method,key,body,condition})=>{
  assert.match(key,/^(ledger\.json|snapshots\/[a-f0-9]{64}\.json)$/);
  const current=objects.get(key);
  if(method==='GET'){
    if(condition['if-match']&&current?.etag!==condition['if-match'])return {status:412};
    return current?{status:200,...current}:{status:404};
  }
  assert.ok(condition['if-match']||condition['if-none-match']==='*');
  if((condition['if-none-match']==='*'&&current)||(condition['if-match']&&current?.etag!==condition['if-match']))return {status:412};
  objects.set(key,{etag:'"version-'+(++version)+'"',body:Buffer.from(body)});
  return {status:200};
};
const start='2026-11-13T22:30:00.000Z';
const store=createProspectiveR2PaperStore({transport,clock:()=>start});
assert.equal(await store.read(),null);
const genesis=await Promise.all([store.initialize(),store.initialize()]);
assert.equal(genesis.filter(x=>x.created).length,1);
assert.equal(genesis[0].originId,genesis[1].originId);
const first=await store.read();
assert.equal((await store.verifyCurrentSnapshot()).eventCount,0);
assert.equal(JSON.parse(first.body).events.length,0);
const digest=createHash('sha256').update(objects.get('ledger.json').body).digest('hex');
assert.equal((await store.verifySnapshot(digest)).eventCount,0);
const now='2026-11-13T22:40:00.000Z';
const signal={signalId:'fenice-xnas-aapl-20261113-cloud-strict',key:'XNAS:AAPL',mic:'XNAS',side:'BUY',currency:'USD',
 decisionAt:now,referenceSessionDate:'2026-11-13',referenceCloseAt:'2026-11-13T21:00:00.000Z',
 referencePublishedAt:'2026-11-13T22:15:00.000Z',sourceSnapshotHash:'f'.repeat(64),maxNotionalEuro:50,
 strategyReason:'UPTREND_CONFIRMATION',researchSignalOnly:true,sourceRightsIndependentlyCertified:false};
const next=recordOneGlobalEodSignal({previousLedger:JSON.parse(first.body),nowIso:now,signal}).ledger;
const args={expectedEtag:first.etag,body:JSON.stringify(next),contentType:'application/json'};
const results=await Promise.allSettled([store.compareAndSwap(args),store.compareAndSwap(args)]);
assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
assert.equal(results.filter(x=>x.status==='rejected').length,1);
assert.equal(JSON.parse((await store.read()).body).events.length,1);
assert.equal((await store.verifySnapshot(digest)).verified,true);
await assert.rejects(store.compareAndSwap(args));
const restarted=createProspectiveR2PaperStore({transport});
assert.equal((await restarted.initialize()).created,false);
assert.equal((await restarted.read()).originId,first.originId);
assert.equal((await restarted.verifyCurrentSnapshot()).eventCount,1);
const current=objects.get('ledger.json');
const currentBackupKey='snapshots/'+createHash('sha256').update(current.body).digest('hex')+'.json';
const currentBackup=objects.get(currentBackupKey);
objects.delete(currentBackupKey);
await assert.rejects(restarted.verifyCurrentSnapshot(),/CURRENT_SNAPSHOT_NOT_VERIFIED/);
objects.set(currentBackupKey,currentBackup);
assert.equal((await restarted.verifyCurrentSnapshot()).verified,true);
const damaged=JSON.parse(current.body);damaged.ledger.cashEuro=999999;
objects.set('ledger.json',{...current,body:Buffer.from(JSON.stringify(damaged))});
await assert.rejects(restarted.read(),/ENVELOPE_INVALID/);
// A matching envelope digest cannot legitimize an invalid replayed account.
damaged.ledgerSha256=createHash('sha256').update(JSON.stringify(damaged.ledger)+'\n').digest('hex');
objects.set('ledger.json',{...current,body:Buffer.from(JSON.stringify(damaged)+'\n')});
await assert.rejects(restarted.read(),/LEDGER_REPLAY_ACCOUNT_MISMATCH/);
objects.set('ledger.json',current);
assert.equal(JSON.parse((await restarted.read()).body).liveTradingAllowed,false);
console.log('Independent R2 PAPER genesis, CAS, backup and integrity mock tests passed (no provider or LIVE access).');
