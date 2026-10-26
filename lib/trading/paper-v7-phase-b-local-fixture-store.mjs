/**
 * FENICE V7 Phase B — LOCAL OFFLINE FIXTURE custody.
 *
 * This is NOT the operational PAPER writer. The only persisted contents are
 * TEST_FIXTURE records and zero genuinely certified PAPER fills.  Inputs
 * cannot grant real exchange licensing, approve an owner, or enable a broker.
 *
 * Private directory outside Git repo, O_EXCL lock (never auto-steal),
 * replay on every read, one-version CAS, fsynced temp+atomic rename+dir fsync.
 * No network, no trading credentials, no V6 imports or writes.
 */
import {createHash,randomBytes} from "node:crypto";
import {mkdir,lstat,open,readFile,realpath,rename,unlink} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {newFixturePhaseBLedger,replayFixturePhaseBLedger}
  from "./paper-v7-phase-b-fixture-ledger.mjs";
import {previewV7PhaseBOfflineFixture}
  from "./paper-v7-phase-b-offline-bridge.mjs";

const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const STATE_FILE="v7-phase-b.fixture-state.json";
const LOCK_FILE="v7-phase-b.fixture-exclusive.lock";
const MAX_BYTES=300000;
const hash=text=>createHash("sha256").update(text).digest("hex");
const freshState=()=>({
  version:1,mode:"V7_PHASE_B_LOCAL_TEST_FIXTURE_ONLY",
  fixtureOnly:true,generation:0,ledger:newFixturePhaseBLedger(),
  fixtureKillSwitchEngaged:false,fixtureKillSwitchEngagedAt:null,
  ledgerSha256:null,previousStateSha256:null,
  operationalPaperApproverVerified:false,
  independentLicensedQuotesVerified:false,
  canCreateGenuinePaperFills:false,
  brokerConnectivityAllowed:false,liveTradingAllowed:false,
});
const bad=code=>{throw Error("PHASE_B_FIXTURE_CUSTODY_"+code)};
const inside=(child,root)=>child===root||child.startsWith(root+path.sep);
const strictNoSymlinkDirectory=async directory=>{
  if(typeof directory!=="string"||!path.isAbsolute(directory))
    bad("PRIVATE_ABSOLUTE_DIRECTORY_REQUIRED");
  const root=path.resolve(directory);
  if(inside(root,REPO))bad("CANNOT_PERSIST_INSIDE_REPOSITORY");
  await mkdir(root,{recursive:true,mode:0o700});
  const info=await lstat(root);
  if(!info.isDirectory()||info.isSymbolicLink())bad("UNTRUSTED_DIRECTORY");
  const actual=await realpath(root);
  if(actual!==root||inside(actual,REPO))bad("SYMLINK_OR_REPO_REDIRECT");
  // Require owner-only custody: shared/other-readable local journal is not
  // acceptable even if the underlying journal contains no credentials.
  if((info.mode&0o077)!==0)bad("PRIVATE_DIRECTORY_PERMISSIONS");
  return root;
};
const readEnvelope=async root=>{
  const file=path.join(root,STATE_FILE);
  let raw;
  try{
    const st=await lstat(file);
    if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_BYTES||st.size===0
      ||(st.mode&0o077)!==0)bad("INVALID_STATE_FILE");
    raw=await readFile(file,"utf8");
  }catch(e){
    if(e.code==="ENOENT")return {...freshState(),ledgerSha256:hash(
      JSON.stringify(newFixturePhaseBLedger()))};
    throw e;
  }
  let obj;
  try{obj=JSON.parse(raw)}catch{bad("INVALID_JSON")}
  if(!obj||obj.version!==1||obj.mode!=="V7_PHASE_B_LOCAL_TEST_FIXTURE_ONLY"
    ||obj.fixtureOnly!==true||!Number.isSafeInteger(obj.generation)||obj.generation<1
    ||typeof obj.fixtureKillSwitchEngaged!=="boolean"
    ||(obj.fixtureKillSwitchEngaged===false&&obj.fixtureKillSwitchEngagedAt!==null)
    ||(obj.fixtureKillSwitchEngaged===true
      &&(typeof obj.fixtureKillSwitchEngagedAt!=="string"
        ||Number.isNaN(Date.parse(obj.fixtureKillSwitchEngagedAt))))
    ||obj.operationalPaperApproverVerified!==false
    ||obj.independentLicensedQuotesVerified!==false
    ||obj.canCreateGenuinePaperFills!==false
    ||obj.brokerConnectivityAllowed!==false||obj.liveTradingAllowed!==false
    ||typeof obj.ledgerSha256!=="string"
    ||obj.ledgerSha256!==hash(JSON.stringify(obj.ledger))
    ||(obj.previousStateSha256!==null
      &&!/^[a-f0-9]{64}$/.test(obj.previousStateSha256))
    ||!replayFixturePhaseBLedger(obj.ledger).valid)
    bad("STATE_REPLAY_OR_HASH_MISMATCH");
  return obj;
};
const safeResult=(state,status)=>{
  const report=replayFixturePhaseBLedger(state.ledger);
  if(!report.valid)bad("REPLAY_FAILED");
  return {
    state:status,
    generation:state.generation,
    attemptCount:report.summary.attempts,
    fixtureFills:report.summary.fixtureFills,
    fixtureLedgerTip:state.ledger.lastHash,
    virtualCashEuro:report.summary.cashEuro,
    previousStateSha256:state.previousStateSha256,
    // Deliberately disjoint from any certification schema.
    fixtureOnly:true,genuineOperationalPhaseBFills:0,
    fixtureKillSwitchEngaged:state.fixtureKillSwitchEngaged,
    fixtureKillSwitchEngagedAt:state.fixtureKillSwitchEngagedAt,
    signedOwnerApprovalForOperationalPAPER:false,
    independentExchangeDataRightsAttested:false,
    operationalPaperWritingAllowed:false,
    brokerConnectivityAllowed:false,liveTradingAllowed:false,
    changesProviderKeys:false,changesV6:false,
  };
};
const commitAtomic=async(root,envelope,{injectFailureBeforeRename=false}={})=>{
  const name=path.join(root,STATE_FILE);
  const temporary=path.join(root,"."+STATE_FILE+"."+randomBytes(12).toString("hex")+".tmp");
  const data=JSON.stringify(envelope)+"\n";
  if(Buffer.byteLength(data)>MAX_BYTES)bad("STATE_TOO_LARGE");
  let tempCreated=false,renamed=false;
  try{
    const fd=await open(temporary,"wx",0o600);
    tempCreated=true;
    try{await fd.writeFile(data);await fd.sync()}finally{await fd.close()}
    if(injectFailureBeforeRename)bad("INJECTED_BEFORE_RENAME");
    await rename(temporary,name);
    renamed=true;
    const dirFd=await open(root,"r");
    try{await dirFd.sync()}finally{await dirFd.close()}
  }finally{
    if(tempCreated&&!renamed)await unlink(temporary).catch(()=>{});
  }
};
const exclusive=async(root,action)=>{
  const lockPath=path.join(root,LOCK_FILE);
  let handle;
  try{handle=await open(lockPath,"wx",0o600)}
  catch(e){if(e.code==="EEXIST")bad("LOCK_BUSY");throw e}
  try{
    await handle.writeFile(JSON.stringify({pid:process.pid,fixtureOnly:true})+"\n");
    await handle.sync();
    return await action();
  }finally{
    await handle.close();
    // Deliberately NEVER steal a preexisting/stale lock. A crash requires
    // an operator to inspect and recover the lock out of band.
    await unlink(lockPath);
  }
};
export async function inspectLocalPhaseBFixture(directory){
  const root=await strictNoSymlinkDirectory(directory);
  const state=await readEnvelope(root);
  return safeResult(state,"LOCAL_FIXTURE_INSPECTED");
}
/**
 * Only test fixture previews can be persisted, and every attempt requires
 * an explicit EXPECTED CURRENT SHA tip plus the OS-exclusive lock.
 *
 * For a real campaign, replace this adapter with a separately authorized
 * durable writer, independently verified legal rights, locked baseline and
 * operator attestation. Never rename this fixture ledger to actual PAPER.
 */
export async function appendLocalPhaseBFixture({
  directory,expectedFixtureLedgerTip,proposal,
  injectFailureBeforeRename=false,
}={}){
  const root=await strictNoSymlinkDirectory(directory);
  if(typeof expectedFixtureLedgerTip!=="string"
    ||!(expectedFixtureLedgerTip==="GENESIS"
      ||/^[a-f0-9]{64}$/.test(expectedFixtureLedgerTip)))
    bad("EXPECTED_LEDGER_TIP_REQUIRED");
  return exclusive(root,async()=>{
    const old=await readEnvelope(root);
    if(old.fixtureKillSwitchEngaged===true)
      return safeResult(old,"FIXTURE_KILL_SWITCH_PERMANENTLY_ENGAGED");
    if(old.ledger.attempts.some(e=>e.intentId===proposal?.intent?.id))
      return safeResult(old,"DUPLICATE_NOOP");
    if(old.ledger.lastHash!==expectedFixtureLedgerTip)
      return safeResult(old,"STALE_SNAPSHOT_REJECTED");
    const candidate=previewV7PhaseBOfflineFixture({
      ...proposal,fixtureLedger:old.ledger,
    });
    if(!candidate.fixtureGenerated||!candidate.candidateFixtureLedger)
      return {
        ...safeResult(old,"PREVIEW_BLOCKED_NO_WRITE"),
        previewBlockers:candidate.reasons,
      };
    if(candidate.genuineOperationalPhaseBFills!==0
      ||candidate.canCreateOperationalPaperFill!==false
      ||candidate.canQueueRealBrokerOrder!==false
      ||candidate.liveTradingAllowed!==false
      ||candidate.candidateFixtureLedger.fixtureOnly!==true)
      bad("PREVIEW_UNSAFE");
    const checked=replayFixturePhaseBLedger(candidate.candidateFixtureLedger);
    if(!checked.valid||checked.summary.attempts!==old.ledger.attempts.length+1)
      bad("PRECOMMIT_LEDGER_NOT_REPLAYABLE");
    const next={
      ...old,generation:old.generation+1,
      ledger:candidate.candidateFixtureLedger,
      ledgerSha256:hash(JSON.stringify(candidate.candidateFixtureLedger)),
      previousStateSha256:old.generation===0?null:hash(JSON.stringify(old)),
    };
    await commitAtomic(root,next,{injectFailureBeforeRename});
    const committed=await readEnvelope(root);
    if(committed.ledger.lastHash!==next.ledger.lastHash
      ||committed.generation!==next.generation)
      bad("POSTCOMMIT_READBACK_MISMATCH");
    return safeResult(committed,"TEST_FIXTURE_ATOMIC_COMMITTED");
  });
}

/**
 * Emergency deny-only stop. Permanently seals THIS fixture campaign across
 * restarts. Clearing the stop is unsupported; a new separate test campaign
 * and separate directory would be required.
 */
export async function engageLocalPhaseBFixtureKillSwitch(directory){
  const root=await strictNoSymlinkDirectory(directory);
  return exclusive(root,async()=>{
    const old=await readEnvelope(root);
    if(old.fixtureKillSwitchEngaged)
      return safeResult(old,"FIXTURE_KILL_SWITCH_ALREADY_ENGAGED");
    const next={
      ...old,fixtureKillSwitchEngaged:true,
      fixtureKillSwitchEngagedAt:new Date().toISOString(),
      generation:old.generation+1,
      ledgerSha256:hash(JSON.stringify(old.ledger)),
      previousStateSha256:old.generation===0?null:hash(JSON.stringify(old)),
    };
    await commitAtomic(root,next);
    const committed=await readEnvelope(root);
    if(!committed.fixtureKillSwitchEngaged
      ||committed.generation!==next.generation
      ||committed.ledger.lastHash!==old.ledger.lastHash)
      bad("KILL_SWITCH_POSTCOMMIT_VERIFICATION_FAILED");
    return safeResult(committed,"FIXTURE_KILL_SWITCH_ENGAGED");
  });
}
