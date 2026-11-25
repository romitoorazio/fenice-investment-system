/** Opt-in durable virtual PAPER ledger. Never touches existing campaign ledgers or brokers. */
import {mkdir,open,readFile,rename,rm} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {randomUUID} from "node:crypto";
import {appendVirtualFill,replayVirtualLedger} from "./virtual-ledger.mjs";
export const emptyVirtualLedger=()=>({mode:"FENICE_ONE_GLOBAL_VIRTUAL_ONLY",liveTradingAllowed:false,brokerConnectivityAllowed:false,events:[]});
export async function loadDurableVirtualLedger(file){
  let raw;
  try{raw=await readFile(file,"utf8");}
  catch(e){if(e.code==="ENOENT")return emptyVirtualLedger();throw e;}
  const ledger=JSON.parse(raw),audit=replayVirtualLedger(ledger);
  if(!audit.valid)throw Error(audit.reason);
  return ledger;
}
export async function appendDurableVirtualFill({file,identity,fill,evidence}){
  if(typeof file!=="string"||!file.trim())throw Error("INVALID_LEDGER_PATH");
  const path=resolve(file),dir=dirname(path),lock=path+".lock";
  await mkdir(dir,{recursive:true});
  let handle;
  try{handle=await open(lock,"wx",0o600);}
  catch(e){if(e.code==="EEXIST")throw Error("LEDGER_BUSY");throw e;}
  let temp=null;
  try{
    const ledger=await loadDurableVirtualLedger(path);
    const result=appendVirtualFill({ledger,identity,fill,evidence});
    if(!result.added)return {...result,persisted:true};
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
