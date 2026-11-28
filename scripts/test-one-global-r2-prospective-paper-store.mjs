import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProspectiveR2PaperStore,assertR2ProspectiveClockAfterReadback} from '../lib/trading/one-global-r2-prospective-paper-store.mjs';
import {recordOneGlobalEodSignal} from '../lib/trading/one-global-eod-paper.mjs';
const objects=new Map();let version=0;
const transport=async ({method,key,body,condition})=>{
  assert.match(key,/^(ledger\.json|snapshots\/[a-f0-9]{64}\.json|evidence\/settlement-inputs\.json|evidence\/observations\/[a-f0-9]{64}\.json|evidence\/raw\/[a-f0-9]{64})$/);
  const current=objects.get(key);
  if(method==='GET'){
    if(condition['if-match']&&current?.etag!==condition['if-match'])return {status:412};
    return current?{status:200,...current}:{status:404};
  }
  assert.ok(condition['if-match']||condition['if-none-match']==='*');
  if((condition['if-none-match']==='*'&&current)||(condition['if-match']&&current?.etag!==condition['if-match']))return {status:412};
  const bytes=Buffer.from(body);
  const etag=key==='evidence/settlement-inputs.json'
    ?'"'+createHash('md5').update(bytes).digest('hex')+'"'
    :'"version-'+(++version)+'"';
  objects.set(key,{etag,body:bytes});
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

 // Separate buckets and create-only encrypted objects; exclusively synthetic.
 const env={
   R2_ENDPOINT:'https://'+ 'a'.repeat(32)+'.r2.cloudflarestorage.com',
   R2_BUCKET_NAME:'fenice-private-storage',R2_ACCESS_KEY_ID:'mock-primary-id',
   R2_SECRET_ACCESS_KEY:'mock-primary-secret',
   R2_BACKUP_ENDPOINT:'https://'+ 'b'.repeat(32)+'.r2.cloudflarestorage.com',
   R2_BACKUP_BUCKET_NAME:'fenice-paper-backup-test',R2_BACKUP_ACCESS_KEY_ID:'mock-backup-id',
   R2_BACKUP_SECRET_ACCESS_KEY:'mock-backup-secret',R2_BACKUP_ENCRYPTION_KEY_HEX:'a'.repeat(64)
 };
 const external=new Map();
 let writes=0, putAttempts=0;
 const backupTransport=async({method,key,body,condition})=>{
   assert.match(key,/^encrypted\/[a-f0-9]{64}\.bin$/);
   if(method==='GET')return external.has(key)?{status:200,body:external.get(key)}:{status:404};
   putAttempts++;
   assert.equal(condition['if-none-match'],'*');
   if(external.has(key))return {status:412};
   writes++;
   assert.ok(Buffer.isBuffer(body));
   external.set(key,Buffer.from(body));
   return {status:200};
 };
 const backed=createProspectiveR2PaperStore({env,transport,backupTransport});
 const primaryBefore=Buffer.from(objects.get('ledger.json').body);
 const saved=await backed.backupCurrent();
 assert.equal(saved.verified,true);
 assert.equal(saved.backupAccountSeparated,true);
 assert.equal(saved.eventCount,1);
 assert.equal(saved.digest,createHash('sha256').update(primaryBefore).digest('hex'));
 assert.equal(saved.liveTradingAllowed,false);
 const key='encrypted/'+saved.digest+'.bin';
 assert.notDeepEqual(external.get(key),primaryBefore);
 assert.equal(external.get(key).length,primaryBefore.length+29);
 assert.equal((await backed.backupCurrent()).digest,saved.digest);
 assert.equal(writes,1);
 assert.equal(putAttempts,1,'unchanged backup never attempts another PUT');
 assert.equal((await backed.verifyIndependentBackup(saved.digest)).eventCount,1);
 assert.deepEqual(objects.get('ledger.json').body,primaryBefore);
 const sameAccount=createProspectiveR2PaperStore({env:{...env,R2_BACKUP_ENDPOINT:env.R2_ENDPOINT},transport,backupTransport});
 assert.equal((await sameAccount.backupCurrent()).backupAccountSeparated,false);
 assert.equal((await sameAccount.verifyIndependentBackup(saved.digest)).backupAccountSeparated,false);
 const defaultEndpoint=createProspectiveR2PaperStore({env:{...env,R2_BACKUP_ENDPOINT:undefined},transport,backupTransport});
 assert.equal((await defaultEndpoint.backupCurrent()).backupAccountSeparated,false);
 const canonicalBucket=createProspectiveR2PaperStore({env:{...env,R2_BACKUP_ENDPOINT:undefined,R2_BACKUP_BUCKET_NAME:'fenice-paper-backup'},transport,backupTransport});
 assert.equal((await canonicalBucket.backupCurrent()).backupAccountSeparated,false);
 assert.equal((await canonicalBucket.verifyIndependentBackup(saved.digest)).verified,true);
 for(const invalid of [{R2_BACKUP_BUCKET_NAME:'fenice-paper-backup-'},{R2_BACKUP_BUCKET_NAME:'unrelated-backup'},{R2_BACKUP_BUCKET_NAME:env.R2_BUCKET_NAME},{R2_BACKUP_ACCESS_KEY_ID:env.R2_ACCESS_KEY_ID},{R2_BACKUP_SECRET_ACCESS_KEY:env.R2_SECRET_ACCESS_KEY}]){
   const rejected=createProspectiveR2PaperStore({env:{...env,...invalid},transport,backupTransport});
   await assert.rejects(rejected.backupCurrent(),/INDEPENDENT_BACKUP_CONFIG_REQUIRED/);
 }
 const wrongKey=createProspectiveR2PaperStore({env:{...env,R2_BACKUP_ENCRYPTION_KEY_HEX:'b'.repeat(64)},transport,backupTransport});
 await assert.rejects(wrongKey.verifyIndependentBackup(saved.digest),/AUTHENTICATION_FAILED/);
 const originalCipher=Buffer.from(external.get(key));
 const corrupt=Buffer.from(originalCipher);corrupt[corrupt.length-1]^=1;
 external.set(key,corrupt);
 await assert.rejects(backed.backupCurrent(),/AUTHENTICATION_FAILED/);
 external.set(key,originalCipher);
 assert.equal((await backed.verifyIndependentBackup(saved.digest)).verified,true);
 assert.equal(writes,1);
 console.log('Independent encrypted backup, immutable retry, and isolated restore mock tests passed.');

// Prospective evidence storage, exclusively synthetic.
const evidenceStore=createProspectiveR2PaperStore({transport,clock:()=>now});
assert.equal(evidenceStore.campaignKind,'R2_PROSPECTIVE_UNCERTIFIED');
assert.equal(await evidenceStore.readSettlementContext(),null);
const originalLedgerBytes=Buffer.from(objects.get('ledger.json').body);
const context=JSON.stringify({kind:'ONE_GLOBAL_PRIVATE_SETTLEMENT_CONTEXT',authority:{liveTradingAllowed:false,brokerConnectivityAllowed:false},documents:[],markets:[],sessions:[]})+'\n';
const contextSaved=await evidenceStore.writeSettlementContext({expectedEtag:null,body:context});
assert.equal((await evidenceStore.readSettlementContext()).body,context);
const identicalContext=await evidenceStore.writeSettlementContext({expectedEtag:contextSaved.etag,body:context});
assert.equal(identicalContext.committed,true);
assert.equal(identicalContext.etag,contextSaved.etag);
assert.equal((await evidenceStore.readSettlementContext()).etag,contextSaved.etag);
await assert.rejects(evidenceStore.writeSettlementContext({expectedEtag:null,body:context}),/CONTEXT_CAS_CONFLICT/);
await assert.rejects(evidenceStore.writeSettlementContext({expectedEtag:contextSaved.etag,body:context.replace('false','true')}),/CONTEXT_SCOPE_INVALID/);
const contextNext=context.replace('"sessions":[]','"sessions":[{}]');
const contextRace=await Promise.allSettled([evidenceStore.writeSettlementContext({expectedEtag:contextSaved.etag,body:contextNext}),evidenceStore.writeSettlementContext({expectedEtag:contextSaved.etag,body:contextNext})]);
assert.equal(contextRace.filter(x=>x.status==='fulfilled').length,1);
assert.equal(contextRace.filter(x=>x.status==='rejected').length,1);
assert.notEqual((await evidenceStore.readSettlementContext()).etag,contextSaved.etag);
assert.equal((await evidenceStore.readSettlementContext()).body,contextNext);
await assert.rejects(evidenceStore.writeSettlementContext({expectedEtag:contextSaved.etag,body:context}),/CONTEXT_CAS_CONFLICT/);
const corruptReadbackStore=createProspectiveR2PaperStore({clock:()=>now,transport:async args=>{
  const result=await transport(args);
  if(args.method==='GET'&&args.key==='evidence/settlement-inputs.json'&&result.status===200)
    return {...result,body:Buffer.from('incorrect readback')};
  return result;
}});
await assert.rejects(corruptReadbackStore.writeSettlementContext({expectedEtag:(await evidenceStore.readSettlementContext()).etag,body:contextNext}),/CONTEXT_READBACK_UNCONFIRMED/);
const obs=JSON.stringify({kind:'TEST_ONLY_OBSERVATION',liveTradingAllowed:false})+'\n';
const obsHash=createHash('sha256').update(obs).digest('hex');
assert.equal((await evidenceStore.createResearchObservation({hash:obsHash,body:obs})).created,true);
assert.equal((await evidenceStore.createResearchObservation({hash:obsHash,body:obs})).created,false);
await assert.rejects(evidenceStore.createResearchObservation({hash:obsHash,body:obs.replace('TEST_ONLY','DIFFERENT')}),/EVIDENCE_READBACK_MISMATCH/);
const observed=await evidenceStore.readResearchObservation(obsHash);
assert.equal(observed.body.toString(),obs);
assert.equal(observed.uploadedAt,null);
assert.equal(observed.uploadedAtSource,'R2_PRIVATE_READBACK_ONLY');
assert.equal(observed.readbackObservedAt,now);
const proof=await evidenceStore.verifyProspectivePrecommitObservation({hash:obsHash,body:obs});
assert.equal(proof.provenance,'R2_PRIVATE_READBACK_ONLY');
assert.equal(proof.historicalChronologyProven,false);
assert.equal(proof.observationSha256,obsHash);
assert.equal(proof.originId,first.originId);
assert.equal('uploadedAt' in proof,false);
assertR2ProspectiveClockAfterReadback({proof,recordedAt:now});
assert.throws(()=>assertR2ProspectiveClockAfterReadback({proof,recordedAt:start}),/PRECOMMIT_READBACK_CLOCK_INVALID/);
assert.throws(()=>assertR2ProspectiveClockAfterReadback({proof:{...proof,historicalChronologyProven:true},recordedAt:now}),/PRECOMMIT_READBACK_CLOCK_INVALID/);
await assert.rejects(evidenceStore.verifyProspectivePrecommitObservation({hash:obsHash,body:obs.replace('TEST_ONLY','DIFFERENT')}),/EVIDENCE_READBACK_MISMATCH/);
const reversedClockStore=createProspectiveR2PaperStore({transport,clock:()=> '2026-11-13T22:29:00.000Z'});
await assert.rejects(reversedClockStore.verifyProspectivePrecommitObservation({hash:obsHash,body:obs}),/PRECOMMIT_READBACK_BEFORE_GENESIS/);
const raw=Buffer.from('synthetic market-data test artifact');
const rawHash=createHash('sha256').update(raw).digest('hex');
assert.equal((await evidenceStore.createSourceArtifact({hash:rawHash,body:raw,contentType:'text/csv'})).verified,true);
assert.equal((await evidenceStore.createSourceArtifact({hash:rawHash,body:raw,contentType:'text/csv'})).created,false);
assert.deepEqual((await evidenceStore.readSourceArtifact(rawHash)).body,raw);
await assert.rejects(evidenceStore.createSourceArtifact({hash:'0'.repeat(64),body:raw,contentType:'text/csv'}),/RAW_ARTIFACT_INVALID/);
await assert.rejects(evidenceStore.readResearchObservation('../ledger.json'),/EVIDENCE_HASH_INVALID/);
assert.deepEqual(objects.get('ledger.json').body,originalLedgerBytes);
console.log('Prospective R2 evidence storage tests passed; no historical chronology attested.');
