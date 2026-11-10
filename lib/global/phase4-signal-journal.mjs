/** Phase 4 append-only research signal journal. Persist with a durable external store; no broker I/O. */
import {createHash} from "node:crypto";
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function appendPhase4Signals({journal=[],candidates=[],capturedAt=new Date().toISOString()}={}){
 if(!Array.isArray(journal)||!Array.isArray(candidates)||!Number.isFinite(Date.parse(capturedAt)))throw Error("INVALID_PHASE4_JOURNAL_POLICY");
 const rows=journal.map(x=>({...x}));
 const seen=new Map();
 let previousHash="GENESIS";
 for(const row of rows){
  if(!row||row.previousHash!==previousHash||typeof row.hash!=="string"||digest({previousHash:row.previousHash,signal:row.signal})!==row.hash)throw Error("PHASE4_JOURNAL_INTEGRITY_FAILURE");
  const key=`${row.signal?.mic}|${row.signal?.instrumentId}|${row.signal?.observedAt}`;
  if(seen.has(key))throw Error("PHASE4_JOURNAL_DUPLICATE");
  seen.set(key,row.hash);previousHash=row.hash;
 }
 let appended=0,duplicates=0;
 for(const c of candidates){
  if(!c||typeof c.mic!=="string"||typeof c.instrumentId!=="string"||!Number.isFinite(Date.parse(c.observedAt))||Date.parse(c.observedAt)>Date.parse(capturedAt)||typeof c.score!=="number"||!Number.isFinite(c.score)||c.dataVerified!==false||c.executable!==false)throw Error("INVALID_PHASE4_RESEARCH_SIGNAL");
  const key=`${c.mic}|${c.instrumentId}|${c.observedAt}`;
  if(seen.has(key)){duplicates++;continue;}
  const signal={mic:c.mic,instrumentId:c.instrumentId,symbol:c.symbol??null,observedAt:c.observedAt,score:c.score,dataVerified:false,executable:false,capturedAt,classification:"PHASE4_FROZEN_UNATTESTED_SIGNAL"};
  const row={previousHash,signal};row.hash=digest(row);
  rows.push(row);seen.set(key,row.hash);previousHash=row.hash;appended++;
 }
 return {mode:"PHASE4_APPEND_ONLY_RESEARCH",liveTradingAllowed:false,paperFillAuthorized:false,ordersGenerated:0,journal:rows,appended,duplicates,headHash:previousHash};
}
