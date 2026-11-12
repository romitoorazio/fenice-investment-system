/**
 * ONE GLOBAL EOD private ledger commit.
 *
 * Atomic rename ALONE is not safe: two contemporaneous providers can each
 * read the same parent, independently settle a different signal, and last
 * writer wins, silently erasing the other fill. Use exclusive writer locking
 * plus compare-and-swap on the complete, replay-validated journal.
 *
 * No broker, provider, secrets or network. Never use this in public CI on
 * actual licensed prices; CI uses deliberately synthetic fixture ledgers.
 */
import {
  openSync,closeSync,existsSync,readFileSync,writeFileSync,
  fsyncSync,renameSync,unlinkSync,
} from "node:fs";
import {randomUUID} from "node:crypto";
import {
  newOneGlobalEodPaperLedger,replayOneGlobalEodPaperLedger,
} from "./one-global-eod-paper.mjs";

const MAX_BYTES=1_500_000;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function readCurrent(file){
  if(!existsSync(file))return newOneGlobalEodPaperLedger();
  const bytes=readFileSync(file);
  if(bytes.byteLength===0||bytes.byteLength>MAX_BYTES)
    throw Error("EOD_PRIVATE_LEDGER_SIZE_INVALID");
  return JSON.parse(bytes.toString("utf8"));
}

/** Commit exactly one forward event, or refuse any concurrent disk change. */
export function commitOneGlobalPrivateEodLedger({ledgerPath,expectedLedger,nextLedger}){
  if(typeof ledgerPath!=="string"||!ledgerPath.trim()||
    !expectedLedger||!nextLedger)
    throw Error("EOD_PRIVATE_COMMIT_ARGUMENTS_INVALID");
  replayOneGlobalEodPaperLedger(expectedLedger);
  replayOneGlobalEodPaperLedger(nextLedger);
  if(nextLedger.events.length!==expectedLedger.events.length+1||
    !equal(nextLedger.events.slice(0,-1),expectedLedger.events)||
    nextLedger.events.at(-1)?.prevHash!==expectedLedger.lastHash)
    throw Error("EOD_PRIVATE_NOT_EXACTLY_ONE_FORWARD_EVENT");

  // Existing lock is intentionally NOT auto-deleted on a time heuristic:
  // only the owning process or an operator may clear a stale .lock file.
  const lockPath=ledgerPath+".lock";
  let lockFd;
  try{
    lockFd=openSync(lockPath,"wx",0o600);
  }catch(e){
    if(e?.code==="EEXIST")throw Error("EOD_PRIVATE_LEDGER_LOCK_BUSY");
    throw e;
  }
  let tempPath=null,tempFd=null;
  try{
    const current=readCurrent(ledgerPath);
    replayOneGlobalEodPaperLedger(current);
    if(!equal(current,expectedLedger))
      throw Error("EOD_PRIVATE_LEDGER_STALE_RELOAD_AND_RECHECK");

    const json=JSON.stringify(nextLedger,null,2)+"\n";
    if(Buffer.byteLength(json,"utf8")>MAX_BYTES)
      throw Error("EOD_PRIVATE_LEDGER_SIZE_INVALID");
    tempPath=ledgerPath+"."+randomUUID()+".tmp";
    tempFd=openSync(tempPath,"wx",0o600);
    writeFileSync(tempFd,json,"utf8");
    fsyncSync(tempFd);
    closeSync(tempFd);
    tempFd=null;
    renameSync(tempPath,ledgerPath);
    tempPath=null;
    return {
      committed:true,newEvents:1,lastHash:nextLedger.lastHash,
      phase9Credit:0,liveTradingAllowed:false,brokerConnectivityAllowed:false,
    };
  }finally{
    if(tempFd!==null)try{closeSync(tempFd)}catch{}
    if(tempPath!==null)try{unlinkSync(tempPath)}catch{}
    try{closeSync(lockFd)}finally{unlinkSync(lockPath)}
  }
}
