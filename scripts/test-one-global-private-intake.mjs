import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {loadPrivateOneGlobalEvidence} from "./run-one-global-strategy-paper.mjs";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const cli=resolve(root,"scripts","run-one-global-strategy-paper.mjs");
const tmp=mkdtempSync(join(tmpdir(),"fenice-one-global-private-"));
const output=join(tmp,"oneglobal-public-report.json");
const observations=join(tmp,"private-observations.json");
const rights=join(tmp,"operator-rights.json");
const now=Date.now(),expires=new Date(now+7*86400000).toISOString();
const qstamp=new Date(now-10000).toISOString();
const sstamp=new Date(now-5000).toISOString();
const proof=(family,provider=family)=>({
  sourceFamily:family,provider,exchangeMic:"XMIL",currency:"EUR",
  evidenceRef:"test-only-synthetic-rights",evidenceSha256:"a".repeat(64),
  usageScope:"NON_DISPLAY_INTERNAL",automatedUseAllowed:true,validUntil:expires,
});
const quote=(family,price,provider=family)=>({
  exchangeMic:"XMIL",symbol:"ENEL",currency:"EUR",sourceFamily:family,
  provider,price,realtime:true,provenanceVerified:true,
  exactVenueVerified:true,observedAt:qstamp,
  entitlement:{status:"VERIFIED",usageScope:"NON_DISPLAY_INTERNAL",
    automatedUseAllowed:true,dualControlVerified:true,
    evidenceRef:"test-only-synthetic-rights",evidenceSha256:"a".repeat(64),
    validUntil:expires},
});
const privatePayload={
  quotes:[quote("synthetic-a",12.34567901),quote("synthetic-b",12.34667901)],
  sessions:[{exchangeMic:"XMIL",source:"synthetic-test-clock",state:"OPEN",
    authoritative:true,observedAt:sstamp}],fx:[],
};
const rightsPayload={sources:[proof("synthetic-a"),proof("synthetic-b")],
  sessions:[{exchangeMic:"XMIL",source:"synthetic-test-clock",
    marketStateEntitled:true,validUntil:expires}],fx:[]};
const dump=(file,doc)=>writeFileSync(file,JSON.stringify(doc)+"\n",{mode:0o600});
const run=(args=[])=>spawnSync(process.execPath,[cli,...args],{
  encoding:"utf8",cwd:root,timeout:20000,
});
try{
  dump(observations,privatePayload);dump(rights,rightsPayload);
  assert.equal(loadPrivateOneGlobalEvidence().provided,false);
  const inputs=loadPrivateOneGlobalEvidence({
    observationsPath:observations,rightsRegistryPath:rights,
  });
  assert.equal(inputs.provided,true);
  assert.equal(inputs.observations.quotes.length,2);
  const a=run([`--observations=${observations}`,`--rights-registry=${rights}`,
    `--output=${output}`]);
  assert.equal(a.status,0,`Private input bridge failed: ${a.stderr?.slice(-800)}`);
  const report=JSON.parse(readFileSync(output,"utf8"));
  assert.equal(report.privateMarketDataPreflight.provided,true);
  assert.equal(report.privateMarketDataPreflight.operatorRightsRegistryProvided,true);
  assert.equal(report.privateMarketDataPreflight.exactVenueRuntimeChecksPassed,1,
    "Two synthetic independent families must pass the actual market-specific simulator runtime checks");
  assert.equal(report.privateMarketDataPreflight.sourceRightsIndependentlyLegallyCertifiedByThisScript,false,
    "Self-asserted private operator registry cannot legally certify source rights");
  assert.equal(report.privateMarketDataPreflight.separateStrategyPaperApprovalProvided,false);
  assert.equal(report.privateMarketDataPreflight.simulationAuthorized,false);
  assert.equal(report.privateMarketDataPreflight.certifiedStrategyFills,0);
  assert.equal(report.authorizedForForwardStrategyPaper,false);
  assert.equal(report.cycle.newlySimulatedOrders,0);
  assert.equal(report.cycle.events,0);
  assert.equal(report.brokerConnectivityAllowed,false);
  assert.equal(report.realBrokerOrdersAllowed,false);
  assert.equal(report.liveTradingAllowed,false);
  assert(!a.stdout.includes("12.34567901")&&!readFileSync(output,"utf8").includes("12.34567901"),
    "Raw private provider prices must never leak into report or logs");
  const b=run([`--observations=${observations}`,`--output=${output}`]);
  assert.notEqual(b.status,0);
  assert(b.stderr.includes("PRIVATE_EVIDENCE_PAIR_REQUIRED"));
  const untrusted={...privatePayload,approval:{approved:true,liveTradingAllowed:true}};
  dump(observations,untrusted);
  const c=run([`--observations=${observations}`,`--rights-registry=${rights}`,
    `--output=${output}`]);
  assert.notEqual(c.status,0);
  assert(c.stderr.includes("PRIVATE_EVIDENCE_UNTRUSTED_FIELDS_OR_SCHEMA"));
  dump(observations,privatePayload);
  const d=run([`--observations=${resolve(root,"data","one-global-strategy-paper-ledger.json")}`,
    `--rights-registry=${rights}`,`--output=${output}`]);
  assert.notEqual(d.status,0);
  assert(d.stderr.includes("PRIVATE_EVIDENCE_INSIDE_REPOSITORY_FORBIDDEN"));
  const e=run(["--authority=true",`--output=${output}`]);
  assert.notEqual(e.status,0);
  assert(e.stderr.includes("ONE_GLOBAL_UNSAFE_OR_UNKNOWN_ARG"));
  dump(rights,{...rightsPayload,brokerConnectivityAllowed:true});
  const f=run([`--observations=${observations}`,`--rights-registry=${rights}`,
    `--output=${output}`]);
  assert.notEqual(f.status,0);
  assert(f.stderr.includes("PRIVATE_EVIDENCE_UNTRUSTED_FIELDS_OR_SCHEMA"));
  dump(rights,{...rightsPayload,
    sources:[proof("synthetic-a","same-provider"),proof("synthetic-b","same-provider")]});
  dump(observations,{...privatePayload,
    quotes:[quote("synthetic-a",12.34567901,"same-provider"),
      quote("synthetic-b",12.34667901,"same-provider")]});
  const g=run([`--observations=${observations}`,`--rights-registry=${rights}`,
    `--output=${output}`]);
  assert.equal(g.status,0);
  const correlated=JSON.parse(readFileSync(output,"utf8"));
  assert.equal(correlated.qualifiedMarketListings,0,
    "Two source labels from one provider must never produce runtime eligible quotes");
  assert.equal(correlated.cycle.newlySimulatedOrders,0);
  console.log("PASS ONE GLOBAL private market-data preflight: runtime independent quote checks, untrusted authority denied, private paths and logs safe, PAPER/LIVE fully off");
}finally{rmSync(tmp,{recursive:true,force:true});}
