import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script=fileURLToPath(new URL("./run-world-v7-private-preflight.mjs", import.meta.url));
const temp=mkdtempSync(path.join(tmpdir(),"fenice-v7-private-"));
const now="2026-10-20T14:00:00.000Z";
const expires="2026-11-15T00:00:00.000Z";
const proof="b".repeat(64);
const evidenceRef="contract://independent-test-proof-only";
const entitlement={
  status:"VERIFIED",usageScope:"NON_DISPLAY_INTERNAL",
  automatedUseAllowed:true,dualControlVerified:true,
  evidenceRef,evidenceSha256:proof,validUntil:expires,
};
const quote=(provider,price)=>({
  symbol:"ENEL",exchangeMic:"XMIL",currency:"EUR",
  sourceFamily:provider,provider,price,
  observedAt:"2026-10-20T13:59:56.000Z",
  realtime:true,provenanceVerified:true,exactVenueVerified:true,
  entitlement,
});
const observations={
  sessions:[{exchangeMic:"XMIL",source:"venue-clock",state:"OPEN",
    authoritative:true,observedAt:"2026-10-20T13:59:55.000Z"}],
  quotes:[quote("independent-a",8),quote("independent-b",8.001)],
  fx:[],
};
const registry={
  sources:["independent-a","independent-b"].map(provider=>({
    sourceFamily:provider,provider,exchangeMic:"XMIL",currency:"EUR",
    automatedUseAllowed:true,usageScope:"NON_DISPLAY_INTERNAL",
    evidenceRef,evidenceSha256:proof,validUntil:expires,
  })),
  sessions:[{exchangeMic:"XMIL",source:"venue-clock",marketStateEntitled:true,
    validUntil:expires}],fx:[],
};
const obsFile=path.join(temp,"observations.json");
const rightsFile=path.join(temp,"registry.json");
const outFile=path.join(temp,"report.json");
const write=(obs,reg)=>{
  writeFileSync(obsFile,JSON.stringify(obs),"utf8");
  writeFileSync(rightsFile,JSON.stringify(reg),"utf8");
};
const invoke=(params=[])=>{
  const run=spawnSync(process.execPath,[script,"--at="+now,"--observations="+obsFile,
    "--rights-registry="+rightsFile,"--output="+outFile,...params],{
    encoding:"utf8",timeout:15_000,maxBuffer:256_000,
  });
  assert.ifError(run.error);
  return run;
};
try {
  write(observations,registry);
  const valid=invoke();
  assert.equal(valid.status,0,valid.stderr);
  const report=JSON.parse(readFileSync(outFile,"utf8"));
  assert.equal(report.listingsAdmittedByRuntimeQuorum,1,"G1 bridge admits real-format independent data");
  assert.equal(report.blockersByListing.find(x=>x.mic==="XMIL").ready,true);
  assert.equal(report.paperAuthorized,false,"even an eligible instrument cannot stage PAPER orders");
  assert.equal(report.simulatedFills,0);
  assert.equal(report.externalLegalRightsIndependentlyCertifiedByThisScript,false);
  assert.equal(report.liveTradingAllowed,false);
  assert.equal(report.modifiesV6,false);
  const reportText=readFileSync(outFile,"utf8");
  assert.equal(reportText.includes('"price"'),false,"no raw private quotes in report");
  assert.equal(reportText.includes('"entitlement"'),false,"no license contract details in report");
  assert.equal(reportText.includes(proof),false,"no proof hashes leaked in report");

  write(observations,{sources:[],sessions:[],fx:[]});
  assert.equal(invoke().status,0);
  assert.equal(JSON.parse(readFileSync(outFile,"utf8")).listingsAdmittedByRuntimeQuorum,0,
    "missing independently controlled registry fails closed");
  write(observations,{...registry,sources:registry.sources.slice(0,1)});
  assert.equal(invoke().status,0);
  assert.equal(JSON.parse(readFileSync(outFile,"utf8")).listingsAdmittedByRuntimeQuorum,0,
    "one quote vendor cannot meet source quorum");
  write({...observations,quotes:observations.quotes.map(q=>({...q,observedAt:"2026-10-19T00:00:00.000Z"}))},registry);
  assert.equal(invoke().status,0);
  assert.equal(JSON.parse(readFileSync(outFile,"utf8")).listingsAdmittedByRuntimeQuorum,0,
    "stale private observations cannot open PAPER");
  write({...observations,entitlements:registry},registry);
  assert.notEqual(invoke().status,0,"self-declared entitlements in observation file forbidden");
  write({...observations, paperRunAuthorized:true},registry);
  assert.notEqual(invoke().status,0,"observation bundle cannot enable PAPER");
  write(observations,registry);
  assert.notEqual(invoke(["--authorize-paper=true"]).status,0,
    "there is no emergency flag to invent an authorization");
  const empty=spawnSync(process.execPath,[script,"--at="+now],{
    encoding:"utf8",timeout:15_000,
  });
  assert.equal(empty.status,0,empty.stderr);
  assert.equal(JSON.parse(empty.stdout).listingsAdmittedByRuntimeQuorum,0,
    "scheduled default needs genuinely supplied evidence");
  console.log("WORLD V7 private evidence preflight and read-only boundary PASS");
} finally {
  rmSync(temp,{recursive:true,force:true});
}
