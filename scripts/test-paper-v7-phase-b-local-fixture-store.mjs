import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,existsSync,writeFileSync,
  chmodSync,symlinkSync,unlinkSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {readFile} from "node:fs/promises";
import {
  inspectLocalPhaseBFixture as inspect,
  appendLocalPhaseBFixture as append,
} from "../lib/trading/paper-v7-phase-b-local-fixture-store.mjs";
const manifest=JSON.parse(await readFile(
  new URL("../data/paper-v7-phase-b-preparation.json",import.meta.url),"utf8"));
const parent=mkdtempSync(path.join(tmpdir(),"fenice-v7-phase-b-store-"));
const directory=path.join(parent,"private");
const statePath=path.join(directory,"v7-phase-b.fixture-state.json");
const lockPath=path.join(directory,"v7-phase-b.fixture-exclusive.lock");
const sourceAt="2026-10-27T15:30:00.000Z";
const expiration="2026-11-19T00:00:00.000Z",sha="a".repeat(64);
const ent={
  status:"VERIFIED",usageScope:"NON_DISPLAY_INTERNAL",automatedUseAllowed:true,
  dualControlVerified:true,evidenceRef:"contract://fixture-test-only",
  evidenceSha256:sha,validUntil:expiration,
};
const instrument={
  ticker:"ENEL",exchangeMic:"XMIL",currency:"EUR",country:"IT",region:"europe",
  assetClass:"equity",status:"active",paperExecutionAllowed:true,
};
const quote=(provider,observedAt)=>({
  symbol:"ENEL",exchangeMic:"XMIL",currency:"EUR",provider,sourceFamily:provider,
  price:provider==="vendor-a"?290:290.02,observedAt,
  realtime:true,provenanceVerified:true,exactVenueVerified:true,entitlement:ent,
});
const source=provider=>({
  provider,sourceFamily:provider,exchangeMic:"XMIL",currency:"EUR",
  automatedUseAllowed:true,usageScope:"NON_DISPLAY_INTERNAL",
  evidenceRef:ent.evidenceRef,evidenceSha256:sha,validUntil:expiration,
});
const rights={
  sources:[source("vendor-a"),source("vendor-b")],
  sessions:[{exchangeMic:"XMIL",source:"licensed-test-clock",
    marketStateEntitled:true,validUntil:expiration}],
  fx:[],
};
function proposal(id="phaseb-store-0001",nowIso=sourceAt,price=290){
  const t=Date.parse(nowIso);
  const atSec=ms=>new Date(t-ms).toISOString();
  return {
    instrument,operatorRightsRegistry:rights,
    observations:{
      quotes:[
        {...quote("vendor-a",atSec(8000)),price},
        {...quote("vendor-b",atSec(8000)),price:price+0.02},
      ],
      sessions:[{exchangeMic:"XMIL",source:"licensed-test-clock",
        state:"OPEN",authoritative:true,observedAt:atSec(6000)}],
      fx:[],
    },
    limits:manifest.proposedRiskLimits,
    intent:{
      id,instrumentKey:"XMIL:ENEL",side:"BUY",
      phase:"V7_PHASE_B_TEST_FIXTURE_ONLY",proposedNotionalEuro:300,
      createdAt:atSec(15000),
    },
    nowIso,
  };
}
const tryAppend=(expectedFixtureLedgerTip,pr,extra={})=>
  append({directory,expectedFixtureLedgerTip,proposal:pr,...extra});
const expectBlock=async (name,fn,code)=>{
  await assert.rejects(fn,new RegExp("PHASE_B_FIXTURE_CUSTODY_"+code),name);
};
try{
  await expectBlock("non-absolute path",()=>inspect("./relative"),"PRIVATE_ABSOLUTE_DIRECTORY_REQUIRED");
  const repoPath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../data/forbidden.fixture");
  await expectBlock("no writes inside repo",()=>inspect(repoPath),"CANNOT_PERSIST_INSIDE_REPOSITORY");
  const firstRead=await inspect(directory);
  assert.equal(firstRead.state,"LOCAL_FIXTURE_INSPECTED");
  assert.equal(firstRead.attemptCount,0);
  assert.equal(firstRead.virtualCashEuro,10000);
  assert.equal(firstRead.fixtureLedgerTip,"GENESIS");
  assert.equal(existsSync(statePath),false,"inspect should not create a journal");
  await expectBlock("expected CAS required",
    ()=>append({directory,proposal:proposal()}),"EXPECTED_LEDGER_TIP_REQUIRED");
  assert.equal(existsSync(statePath),false);

  await expectBlock("crash before rename",()=>tryAppend("GENESIS",proposal(),
    {injectFailureBeforeRename:true}),"INJECTED_BEFORE_RENAME");
  assert.equal(existsSync(statePath),false,"pre-rename crash leaves old state valid");
  assert.equal((await inspect(directory)).attemptCount,0);
  const initial=await tryAppend("GENESIS",proposal());
  assert.equal(initial.state,"TEST_FIXTURE_ATOMIC_COMMITTED");
  assert.equal(initial.attemptCount,1);
  assert.equal(initial.fixtureFills,1);
  assert.equal(initial.genuineOperationalPhaseBFills,0);
  assert.equal(initial.brokerConnectivityAllowed,false);
  assert.equal(initial.liveTradingAllowed,false);
  assert.equal(initial.generation,1);
  assert.equal(initial.fixtureOnly,true);
  assert.equal(initial.previousStateSha256,null);
  assert.equal(existsSync(lockPath),false,"lock released upon success");
  const firstContents=readFileSync(statePath,"utf8");

  const duplicate=await tryAppend("GENESIS",proposal());
  assert.equal(duplicate.state,"DUPLICATE_NOOP","retry of prior ID is harmless");
  assert.equal(readFileSync(statePath,"utf8"),firstContents,"duplicate never rewrites journal");
  const stale=await tryAppend("GENESIS",proposal("phaseb-store-0002","2026-10-28T15:30:00.000Z"));
  assert.equal(stale.state,"STALE_SNAPSHOT_REJECTED");
  assert.equal(readFileSync(statePath,"utf8"),firstContents,"stale CAS may not append");
  const failedQuorum=proposal("phaseb-store-0002","2026-10-28T15:30:00.000Z");
  failedQuorum.observations.quotes.pop();
  const denied=await tryAppend(initial.fixtureLedgerTip,failedQuorum);
  assert.equal(denied.state,"PREVIEW_BLOCKED_NO_WRITE");
  assert.equal(denied.previewBlockers[0],"WORLD_V7_ENTITLEMENT_VENUE_QUORUM_OR_FX_BLOCKED");
  assert.equal(readFileSync(statePath,"utf8"),firstContents);
  const second=await tryAppend(initial.fixtureLedgerTip,
    proposal("phaseb-store-0002","2026-10-28T15:30:00.000Z"));
  assert.equal(second.state,"TEST_FIXTURE_ATOMIC_COMMITTED");
  assert.equal(second.generation,2);
  assert.equal(second.attemptCount,2);
  assert.equal(second.fixtureFills,2);
  assert.equal(typeof second.previousStateSha256,"string");

  const again=await inspect(directory);
  assert.equal(again.state,"LOCAL_FIXTURE_INSPECTED");
  assert.equal(again.generation,2);
  assert.equal(again.fixtureLedgerTip,second.fixtureLedgerTip);
  const state2=readFileSync(statePath,"utf8");

  // Two concurrent proposals attempt a 3rd day against the same hash tip.
  // O_EXCL guarantees never more than one persisted attempt, even though
  // each simulated proposal individually passes its mathematical constraints.
  const a=tryAppend(second.fixtureLedgerTip,
    proposal("phaseb-store-0003","2026-10-29T15:30:00.000Z"));
  const b=tryAppend(second.fixtureLedgerTip,
    proposal("phaseb-store-0004","2026-10-29T15:30:00.000Z"));
  const outcomes=await Promise.allSettled([a,b]);
  const committed=outcomes.filter(x=>x.status==="fulfilled"
    &&x.value.state==="TEST_FIXTURE_ATOMIC_COMMITTED");
  assert.equal(committed.length,1,"CAS+O_EXCL must serialize concurrent writers");
  for(const entry of outcomes){
    if(entry.status==="rejected")
      assert.match(String(entry.reason),/PHASE_B_FIXTURE_CUSTODY_LOCK_BUSY/);
    else if(entry.value.state!=="TEST_FIXTURE_ATOMIC_COMMITTED")
      assert(["STALE_SNAPSHOT_REJECTED","PREVIEW_BLOCKED_NO_WRITE"].includes(entry.value.state));
  }
  assert.equal((await inspect(directory)).attemptCount,3);
  assert.equal(existsSync(lockPath),false);

  // Assert no operator can blindly wipe a stale lock. Deliberate
  // recovery requires separate human inspection and action.
  writeFileSync(lockPath,"stale marker",{mode:0o600});
  await expectBlock("stale lock",()=>tryAppend(
    (committed[0].value).fixtureLedgerTip,
    proposal("phaseb-store-0005","2026-10-30T15:30:00.000Z")),"LOCK_BUSY");
  assert.equal(readFileSync(lockPath,"utf8"),"stale marker");
  unlinkSync(lockPath);

  // Persistence stays durable across independent Node processes.
  const runner=new URL("../lib/trading/paper-v7-phase-b-local-fixture-store.mjs",import.meta.url);
  const child=spawnSync(process.execPath,["--input-type=module","-e",
    "import{inspectLocalPhaseBFixture as inspect}from "+JSON.stringify(runner.href)
      +";console.log(JSON.stringify(await inspect("+JSON.stringify(directory)+")))"
  ],{encoding:"utf8",timeout:15000});
  assert.equal(child.status,0,child.stderr);
  assert.equal(JSON.parse(child.stdout).attemptCount,3);

  // Tampering must NEVER silently reset to seed or accept mutated balances.
  const state3=readFileSync(statePath,"utf8");
  const corrupted=JSON.parse(state3);
  corrupted.ledger.cashEuro=50000;
  writeFileSync(statePath,JSON.stringify(corrupted),{mode:0o600});
  await expectBlock("edited virtual cash",()=>inspect(directory),"STATE_REPLAY_OR_HASH_MISMATCH");
  writeFileSync(statePath,state3,{mode:0o600});
  const changed=JSON.parse(state3);
  changed.brokerConnectivityAllowed=true;
  writeFileSync(statePath,JSON.stringify(changed),{mode:0o600});
  await expectBlock("broker flag smuggling",()=>inspect(directory),"STATE_REPLAY_OR_HASH_MISMATCH");
  writeFileSync(statePath,state3,{mode:0o600});
  writeFileSync(statePath,'{"partial":',{mode:0o600});
  await expectBlock("corrupt JSON",()=>inspect(directory),"INVALID_JSON");
  writeFileSync(statePath,state3,{mode:0o600});
  assert.equal((await inspect(directory)).attemptCount,3);

  const symlink=path.join(parent,"symlink");
  symlinkSync(directory,symlink);
  await expectBlock("directory symlink",()=>inspect(symlink),"UNTRUSTED_DIRECTORY");
  const openDir=path.join(parent,"world-readable");
  await inspect(openDir);
  chmodSync(openDir,0o755);
  await expectBlock("shared directory",()=>inspect(openDir),"PRIVATE_DIRECTORY_PERMISSIONS");
  assert.equal(manifest.authorization.approved,false);
  assert.equal(manifest.authorization.expiresAt,null);
  assert.equal(manifest.safety.newPaperOrdersAllowed,false);
  assert.equal(manifest.safety.liveTradingAllowed,false);
  assert.equal(state2.includes('"fixtureOnly":true'),true);
  console.log("V7 Phase B offline LOCAL fixture: atomic CAS/O_EXCL, fsync, crash, tamper, cross-process, live-lock PASS");
}finally{
  rmSync(parent,{recursive:true,force:true});
}
