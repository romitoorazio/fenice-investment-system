/** Inspect a completed MAIN world-market observation artifact. No provider calls,
 * broker orders, inferred trading hours, or certified PAPER evidence.
 */
import {readFile} from "node:fs/promises";
import {assessGlobalVenueStateHints} from "../lib/global/world-market-observation-bridge.mjs";
const file=process.argv[2];
if(typeof file!=="string"||!file.trim()){
 console.log(JSON.stringify({ok:false,mode:"GLOBAL_VENUE_STATUS_DIAGNOSTIC_ONLY",
  reason:"SOURCE_ARTIFACT_PATH_REQUIRED",countsTowardRealPaper:false,liveTradingAllowed:false}));
 process.exitCode=2;
}else{
 try{
  const source=JSON.parse(await readFile(file,"utf8"));
  const result=assessGlobalVenueStateHints({source,nowIso:new Date().toISOString()});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=2;
 }catch{
  console.log(JSON.stringify({ok:false,mode:"GLOBAL_VENUE_STATUS_DIAGNOSTIC_ONLY",
   reason:"SOURCE_ARTIFACT_UNREADABLE",countsTowardRealPaper:false,liveTradingAllowed:false}));
  process.exitCode=2;
 }
}
