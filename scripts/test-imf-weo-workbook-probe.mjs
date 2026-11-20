import assert from "node:assert/strict";
import {IMF_WEO_OFFICIAL_URL,probeOfficialImfWeoWorkbook} from "../lib/intelligence/imf-weo-workbook-probe.mjs";

const zip=new Uint8Array(16); zip.set([0x50,0x4b,0x03,0x04]);
const response=(bytes,headers={},status=206)=>{
  const r=new Response(bytes,{status,headers:{
    "content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "content-range":"bytes 0-15/950000",...headers
  }});
  return r;
};
const probe=(r,endpoint=IMF_WEO_OFFICIAL_URL)=>probeOfficialImfWeoWorkbook({
  endpoint,fetcher:async()=>r,now:()=>1000
});
const ok=await probe(response(zip));
assert.equal(ok.ok,true,JSON.stringify(ok));
assert.equal(ok.httpStatus,206);
assert.equal(ok.bytes,16);
assert.equal((await probe(response(new TextEncoder().encode("<html>bad</html>")))).ok,false);
assert.equal((await probe(response(zip,{"content-type":"text/html"}))).ok,false);
assert.equal((await probe(response(zip,{"content-range":"bytes 0-15/100"}))).ok,false);
assert.equal((await probe(response(zip,{"content-range":"not-verified"}))).ok,false);
assert.equal((await probe(response(zip,{},404))).ok,false);
assert.equal((await probe(response(zip),"https://evil.example/imf.xlsx")).detail,"IMF_WEO_URL_NOT_PINN");
const failure=await probeOfficialImfWeoWorkbook({
  fetcher:async()=>{throw new Error("no network");},now:()=>1000
});
assert.equal(failure.ok,false);
assert.equal(failure.detail,"IMF_WEO_NETWORK_UNAVAILABLE");
console.log("IMF official workbook source: pinned URL, binary proof, partial coverage, MIME, size, redirect and network failure: PASS");
