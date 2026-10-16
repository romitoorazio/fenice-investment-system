import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const dir=await mkdtemp(path.join(tmpdir(),"fenice-provider-probe-"));
const script=fileURLToPath(new URL("./probe-paper-provider-feasibility.mjs",import.meta.url));
const master=JSON.parse(await readFile(new URL("../data/instrument-master.json",import.meta.url),"utf8"));
const fixture=String.raw`
import { appendFileSync } from "node:fs";
let now=Date.parse("2026-10-16T14:00:00.000Z");
Date.now=()=>now;
globalThis.fetch=async (input,options={})=>{
  const url=new URL(input);
  if((options.method||"GET")!=="GET")throw Error("WRITES_FORBIDDEN");
  appendFileSync("calls.jsonl",JSON.stringify({host:url.hostname,path:url.pathname})+"\n");
  if(url.href==="https://paper-api.alpaca.markets/v2/clock"){
    if(process.env.PROBE_CASE==="UNKNOWN")return Response.json({error:"denied"},{status:403});
    return Response.json({timestamp:new Date(now).toISOString(),is_open:process.env.PROBE_CASE!=="CLOSED"});
  }
  if(process.env.PROBE_CASE==="CLOSED"||process.env.PROBE_CASE==="UNKNOWN")throw Error("CLOSED_PROVIDER_REQUEST");
  if(url.hostname==="api.twelvedata.com"){
    const data=Object.fromEntries(url.searchParams.get("symbol").split(",").map(symbol=>[symbol,{
      symbol,close:"100",currency:"USD",mic_code:symbol==="SPY"?"ARCX":"XNAS",
      last_quote_at:Math.floor(now/1000),timestamp:Math.floor(now/1000),
    }]));
    return Response.json(data);
  }
  if(url.hostname==="data.alpaca.markets"&&url.pathname.endsWith("/quotes/latest")){
    const t=new Date(now).toISOString().replace(".000Z",".000123456Z");
    if(process.env.PROBE_CASE==="EXPIRES")now+=70000;
    return Response.json({quote:{bp:99.9,ap:100.1,t}});
  }
  throw Error("UNEXPECTED_ENDPOINT");
};
`;
try{
  await mkdir(path.join(dir,"data"));
  await writeFile(path.join(dir,"data/instrument-master.json"),JSON.stringify(master));
  await writeFile(path.join(dir,"data/paper-oms-state.json"),"protected-paper-state\n");
  await writeFile(path.join(dir,"mock.mjs"),fixture);
  for(const mode of ["CLOSED","UNKNOWN","OPEN","EXPIRES"]){
    await writeFile(path.join(dir,"calls.jsonl"),"");
    const result=spawnSync(process.execPath,["--experimental-strip-types","--import",path.join(dir,"mock.mjs"),script],{
      cwd:dir,encoding:"utf8",timeout:20000,
      env:{...process.env,PROBE_CASE:mode,FENICE_FEASIBILITY_SYMBOLS:"SPY,QQQ,SPY",
        APCA_API_KEY_ID:"fixture-key",APCA_API_SECRET_KEY:"fixture-secret",TWELVE_DATA_API_KEY:"fixture-twelve",
        FENICE_PROVIDER_FEASIBILITY_REPORT:"report.json",GITHUB_STEP_SUMMARY:""},
    });
    assert.equal(result.status,0,result.stderr||result.stdout);
    const report=JSON.parse(await readFile(path.join(dir,"report.json"),"utf8"));
    const calls=(await readFile(path.join(dir,"calls.jsonl"),"utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(report.targets.length,2,"Duplicate symbols must not spend more credits");
    assert.equal(report.paperStateModified,false);
    assert.equal(report.campaignEvidenceModified,false);
    assert.equal(report.liveTradingAllowed,false);
    assert.equal(report.brokerConnectivityAllowed,false);
    assert.equal(await readFile(path.join(dir,"data/paper-oms-state.json"),"utf8"),"protected-paper-state\n");
    assert(!JSON.stringify(report).includes("fixture-secret"));
    if(mode==="CLOSED"||mode==="UNKNOWN"){
      assert.equal(report.state,"SKIPPED_NO_OPEN_SESSION");
      assert.equal(report.quoteProvidersQueried,false);
      assert.equal(calls.length,1,"Only the PAPER clock may be queried without an authoritative OPEN session");
      assert.deepEqual(report.quorumCompatibleSymbols,[]);
    }else if(mode==="OPEN"){
      assert.equal(report.state,"OPEN_SESSION_SAMPLED");
      assert.deepEqual(report.quorumCompatibleSymbols,["SPY","QQQ"]);
      assert.equal(calls.filter(x=>x.host==="api.twelvedata.com").length,1);
      assert.equal(calls.filter(x=>x.path.endsWith("/trades/latest")).length,0,"Valid nanosecond quotes must avoid needless trade fallback");
    }else{
      assert.equal(report.state,"SESSION_EXPIRED_DURING_PROBE");
      assert.equal(report.targets[0].twelveData.freshVerifiedQuote,false);
      assert.equal(report.targets[0].alpaca.freshVerifiedQuote,false);
      assert.deepEqual(report.quorumCompatibleSymbols,[]);
    }
  }
  console.log("Provider diagnostic integration: OPEN/nanoseconds, CLOSED/UNKNOWN zero quote budget, expiry and PAPER isolation PASS");
}finally{await rm(dir,{recursive:true,force:true});}
