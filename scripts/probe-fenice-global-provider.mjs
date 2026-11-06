/** Manual, read-only Twelve Data diagnostic. No default universe, no secrets in output. */
import {readFile} from "node:fs/promises";
import {probeTwelveDataCoverage} from "../lib/global/provider-coverage-probe.mjs";
const path=process.env.FENICE_GLOBAL_PROBE_UNIVERSE;
const apiKey=process.env.TWELVE_DATA_API_KEY;
if(!path||!apiKey){console.error("PROBE_NOT_CONFIGURED: require FENICE_GLOBAL_PROBE_UNIVERSE and TWELVE_DATA_API_KEY");process.exitCode=2;}
else{
 try{
  const instruments=JSON.parse(await readFile(path,"utf8"));
  const result=await probeTwelveDataCoverage({instruments,apiKey});
  console.log(JSON.stringify(result,null,2));
 }catch(e){console.error("PROBE_FAILED: diagnostic error (details suppressed to protect provider credentials)");process.exitCode=2;}
}
