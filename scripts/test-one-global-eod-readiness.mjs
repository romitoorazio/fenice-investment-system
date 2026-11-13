import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync,spawnSync} from "node:child_process";
import {buildWorldEodPaperReadiness} from "./report-one-global-eod-paper-readiness.mjs";
const eod=JSON.parse(readFileSync("data/world-v7-eod-research.json","utf8"));
const now=new Date(Date.parse(eod.generatedAt)+60*60*1000).toISOString();
const r=buildWorldEodPaperReadiness({eod,nowIso:now});
assert.equal(r.mode,"ONE_GLOBAL_EOD_PRIVATE_PAPER_READINESS_ONLY");
assert.deepEqual(r.observation.map(x=>x.mic),["XMIL","XETR","XTKS"]);
assert.equal(r.observation.length,3);
assert(r.venuesSupportedByPrivateEngine.includes("XNYS"));
assert(r.venuesSupportedByPrivateEngine.includes("XTKS"));
assert.equal(r.maxPositionEuro,50);
assert.equal(r.initialVirtualCapitalEuro,1000);
assert.equal(r.privateLedger.virtualBuys,0);
assert.equal(r.privateLedger.phase9Credit,0);
assert.equal(r.certifiedForwardTrades,0);
assert.equal(r.autoPaperExecutionEnabled,false);
assert.equal(r.privatePricesStoredInPublicRepository,false);
assert.equal(r.liveTradingAllowed,false);
for(const row of r.observation){
  assert(row.blockers.includes("SECOND_INDEPENDENT_COMPLETED_CLOSE_MISSING"));
  assert(row.blockers.includes("EXPLICIT_PRIVATE_EOD_SIMULATION_APPROVAL_REQUIRED"));
  assert(row.blockers.includes("PERSONAL_PAPER_DATA_RIGHTS_UNVERIFIED"));
  assert.equal(row.virtualFillsCertified,0);
  assert.equal(row.phase9Credit,0);
}
const temporary=structuredClone(eod);
temporary.records.XMIL={
  status:"COMPLETE_EOD_RESEARCH",providerSymbolConfirmed:true,
  exactMicCertified:true,licensedPaperSource:true,
  lastCompleteBarDate:"2026-11-11",close:5432.123,
};
const forged=buildWorldEodPaperReadiness({eod:temporary,nowIso:now});
assert.equal(forged.observation[0].blockers.includes("SECOND_INDEPENDENT_COMPLETED_CLOSE_MISSING"),true);
assert.equal(forged.observation[0].blockers.includes("EXPLICIT_PRIVATE_EOD_SIMULATION_APPROVAL_REQUIRED"),true);
assert.equal(forged.observation[0].virtualFillsCertified,0);
assert.equal(forged.observation[0].availableAsResearchOnly,true,
  "fresh completed research remains usable for research, never PAPER fills");
const expired=buildWorldEodPaperReadiness({
  eod:temporary,
  nowIso:new Date(Date.parse(eod.generatedAt)+25*60*60*1000).toISOString(),
});
assert(expired.observation.every(row=>row.blockers.includes("EOD_RESEARCH_SNAPSHOT_STALE")),
  "every venue must report a source snapshot older than 24 hours");
assert.equal(expired.observation[0].availableAsResearchOnly,false,
  "even a completed, apparently licensed row cannot remain available when the source snapshot is stale");
assert.equal(expired.certifiedForwardTrades,0);
assert.equal(expired.liveTradingAllowed,false);
assert.equal(JSON.stringify(forged).includes("5432.123"),false);
assert.throws(()=>buildWorldEodPaperReadiness({
  eod:{...eod,liveTradingAllowed:true},nowIso:now
}),/EOD_READINESS_SOURCE_INVALID/);
assert.throws(()=>buildWorldEodPaperReadiness({
  eod,nowIso:"2020-01-01T00:00:00.000Z"
}),/EOD_READINESS_SOURCE_INVALID/);
const help=execFileSync(process.execPath,["scripts/run-one-global-eod-private.mjs","--help"],{
  encoding:"utf8"});
assert.match(help,/DRY-RUN/);
assert.match(help,/never GitHub or Directa/);
const unsafe=spawnSync(process.execPath,[
  "scripts/run-one-global-eod-private.mjs",
  "--event="+process.cwd()+"/package.json",
  "--ledger=/tmp/fenice-eod-invalid-private-ledger.json"],{encoding:"utf8"});
assert.notEqual(unsafe.status,0,"private market data path under repo must always be rejected");
assert.match(unsafe.stderr,/EOD_NEVER_WRITE_OR_READ_PRIVATE_DATA_INSIDE_REPOSITORY/);
const report=execFileSync(process.execPath,["scripts/report-one-global-eod-paper-readiness.mjs"],{
  encoding:"utf8"});
const meta=JSON.parse(report);
assert.equal(meta.noMarketPricesDisclosed,true);
assert.equal(meta.certifiedForwardTrades,0);
console.log("PASS EOD world onboarding: pilot markets, safe public summary, broker lock, private path guards, no new certification");
