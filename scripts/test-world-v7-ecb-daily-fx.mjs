import assert from "node:assert/strict";
import {parseEcbJpyPerEuroCsv,fetchEcbJpyEurDailyHistory} from "../lib/market/world-v7-ecb-daily-fx.mjs";
const startDate="2026-10-16",endDate="2026-10-23";
const csv="KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,TIME_PERIOD,OBS_VALUE\r\n"+
  "EXR.D.JPY.EUR.SP00.A,D,JPY,EUR,SP00,2026-10-16,180.00\r\n"+
  "EXR.D.JPY.EUR.SP00.A,D,JPY,EUR,SP00,2026-10-19,181.00\r\n"+
  "EXR.D.JPY.EUR.SP00.A,D,JPY,EUR,SP00,2026-10-20,182.50\r\n";
const valid=parseEcbJpyPerEuroCsv(csv,{startDate,endDate});
assert.equal(valid.status,"ECB_DAILY_REFERENCE_HISTORY_PARSED");
assert.equal(valid.observations,3);
assert(Math.abs(valid.fxRates[0].rateToEuro-(1/180))<1e-12);
assert(valid.fxRates[0].rateToEuro<.01,"JPY conversion must be inverted");
assert.deepEqual(valid.fxRates.map(x=>x.date),["2026-10-16","2026-10-19","2026-10-20"]);
assert.equal(parseEcbJpyPerEuroCsv(csv.replace("EXR.D.JPY.EUR.SP00.A","EXR.D.USD.EUR.SP00.A"),{startDate,endDate}).status,"INVALID_ECB_HISTORY_ROW");
assert.equal(parseEcbJpyPerEuroCsv(csv.replace("181.00","0"),{startDate,endDate}).status,"INVALID_ECB_FX_VALUE");
assert.equal(parseEcbJpyPerEuroCsv(csv.replace("181.00",""),{startDate,endDate}).observations,2);
assert.equal(parseEcbJpyPerEuroCsv(csv+csv.split("\r\n")[1]+"\n",{startDate,endDate}).status,"INVALID_ECB_HISTORY_ROW");
assert.equal(parseEcbJpyPerEuroCsv(csv,{startDate:"2026-02-30",endDate}).status,"INVALID_ECB_HISTORY_PAYLOAD");
let requested="";
const output=await fetchEcbJpyEurDailyHistory({startDate,endDate,fetchImpl:async url=>{
  requested=url;
  return {ok:true,headers:{get:()=> "text/csv;charset=utf-8"},text:async()=>csv};
}});
assert.equal(output.status,"ECB_DAILY_REFERENCE_HISTORY_PARSED");
assert(requested.startsWith("https://data-api.ecb.europa.eu/service/data/EXR/D.JPY.EUR.SP00.A?"));
const badContent=await fetchEcbJpyEurDailyHistory({startDate,endDate,fetchImpl:async()=>({
  ok:true,headers:{get:()=>"text/html"},text:async()=>"<html>no</html>"
})});
assert.equal(badContent.status,"ECB_UNEXPECTED_CONTENT_TYPE");
const offline=await fetchEcbJpyEurDailyHistory({startDate,endDate,fetchImpl:async()=>{throw Error("offline")}});
assert.equal(offline.status,"ECB_REFERENCE_DATA_UNAVAILABLE");
console.log("World V7 ECB official reference CSV parsing, FX direction, data provenance and failures: PASS");
