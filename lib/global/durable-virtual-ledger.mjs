/** Opt-in durable virtual PAPER ledger. Never touches existing campaign ledgers or brokers. */
import {mkdir,open,readFile,rename,rm} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {randomUUID} from "node:crypto";
import {appendVirtualFill,replayVirtualLedger} from "./virtual-ledger.mjs";
import {summarizeVirtualPaperLedger} from "./virtual-accounting.mjs";
// Bind virtual capital and fee denomination inside each hash-chained event identity.
// Changing the policy requires a NEW campaign, never rewriting an old result.
export function makeFundedVirtualIdentity(identity,{initialCapitalEur,feeCurrency}={}){
  if(typeof initialCapitalEur!=="number"||!Number.isFinite(initialCapitalEur)||initialCapitalEur<=0||initialCapitalEur>1e12)throw Error("INVALID_VIRTUAL_CAPITAL");
  if(!["QUOTE_CURRENCY","EUR"].includes(feeCurrency))throw Error("FEE_CURRENCY_POLICY_REQUIRED");
  if(!identity||typeof identity!=="object"||Array.isArray(identity))throw Error("INVALID_PAPER_IDENTITY");
  if((Object.hasOwn(identity,"accountingInitialCapitalEur")&&identity.accountingInitialCapitalEur!==initialCapitalEur)||
     (Object.hasOwn(identity,"accountingFeeCurrency")&&identity.accountingFeeCurrency!==feeCurrency))throw Error("VIRTUAL_ACCOUNTING_POLICY_CONFLICT");
  return {...identity,accountingInitialCapitalEur:initialCapitalEur,accountingFeeCurrency:feeCurrency};
}
export const emptyVirtualLedger=()=>({mode:"FENICE_ONE_GLOBAL_VIRTUAL_ONLY",liveTradingAllowed:false,brokerConnectivityAllowed:false,events:[]});
export async function loadDurableVirtualLedger(file){
  let raw;
  try{raw=await readFile(file,"utf8");}
  catch(e){if(e.code==="ENOENT")return emptyVirtualLedger();throw e;}
  const ledger=JSON.parse(raw),audit=replayVirtualLedger(ledger);
  if(!audit.valid)throw Error(audit.reason);
  return ledger;
}
export async function appendDurableVirtualFill({file,identity,fill,evidence,initialCapitalEur,feeCurrency}){
  const fundedIdentity=makeFundedVirtualIdentity(identity,{initialCapitalEur,feeCurrency});
  if(typeof file!=="string"||!file.trim())throw Error("INVALID_LEDGER_PATH");
  const path=resolve(file),dir=dirname(path),lock=path+".lock";
  await mkdir(dir,{recursive:true});
  let handle;
  try{handle=await open(lock,"wx",0o600);}
  catch(e){if(e.code==="EEXIST")throw Error("LEDGER_BUSY");throw e;}
  let temp=null;
  try{
    const ledger=await loadDurableVirtualLedger(path);
    // Reject legacy unfunded records and all cross-write policy changes before any I/O.
    if(ledger.events.some(event=>!Object.hasOwn(event.identity,"accountingInitialCapitalEur")||
       !Object.hasOwn(event.identity,"accountingFeeCurrency")))
      return {ledger,added:false,persisted:false,reason:"VIRTUAL_ACCOUNTING_POLICY_MISSING"};
    if(ledger.events.some(event=>event.identity.accountingInitialCapitalEur!==initialCapitalEur||
       event.identity.accountingFeeCurrency!==feeCurrency))
      return {ledger,added:false,persisted:false,reason:"VIRTUAL_ACCOUNTING_POLICY_CONFLICT"};
    const result=appendVirtualFill({ledger,identity:fundedIdentity,fill,evidence});
    // Only an identical retry refers to a successfully persisted prior event.
    // A conflicting reuse of a signal ID must never be reported as persisted.
    if(!result.added)return {...result,persisted:result.reason==="DUPLICATE_PAPER_SIGNAL"};
    const budget=summarizeVirtualPaperLedger({ledger:result.ledger,initialCapitalEur,feeCurrency,
      expectedCampaignId:fundedIdentity.campaignId});
    if(!budget.ok)return {ledger,added:false,persisted:false,reason:budget.reason,eventIndex:budget.eventIndex};
    temp=path+"."+randomUUID()+".tmp";
    const h=await open(temp,"wx",0o600);
    try{await h.writeFile(JSON.stringify(result.ledger,null,2)+"\n","utf8");await h.sync();}
    finally{await h.close();}
    await rename(temp,path);temp=null;
    const directory=await open(dir,"r");
    try{await directory.sync();}finally{await directory.close();}
    return {...result,persisted:true};
  }finally{
    if(temp)await rm(temp,{force:true});
    await handle.close();
    await rm(lock,{force:true});
  }
}
