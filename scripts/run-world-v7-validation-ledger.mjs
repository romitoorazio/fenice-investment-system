import {readFile,writeFile} from "node:fs/promises";
import {updateWorldV7ValidationLedger} from "../lib/intelligence/world-v7-validation-ledger.mjs";
async function read(path){try{return JSON.parse(await readFile(path,"utf8"));}
 catch(e){if(e.code==="ENOENT")return null;throw e;}}
const [previous,us,eod,access]=await Promise.all([
 read("data/world-v7-validation-ledger.json"),
 read("data/v7-provider-continuity.json"),
 read("data/world-v7-eod-research.json"),
 read("data/world-v7-provider-observation.json")
]);
const {added,ledger}=updateWorldV7ValidationLedger(previous,{us,eod,access});
if(added||!previous?.venues)await writeFile("data/world-v7-validation-ledger.json",JSON.stringify(ledger,null,2)+"\n");
console.log(JSON.stringify({mode:ledger.mode,added,world:ledger.summary.regions,
 byRegion:ledger.summary.researchDaysByRegion,paperFills:0,live:false}));
