import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { scoreResearchFreshness, positiveResearchReferencePrice, researchStrategySnapshot } from "../lib/intelligence/committee-input-integrity.mjs";

const now = Date.parse("2026-10-14T19:00:00.000Z");
const observed = new Date(now - 5 * 3600_000).toISOString();
assert.equal(scoreResearchFreshness(observed,now),100,"Same-day quote is fresh");
assert.equal(scoreResearchFreshness(new Date(now-25*3600_000).toISOString(),now),85);
assert.equal(scoreResearchFreshness(new Date(now-75*3600_000).toISOString(),now),65);
assert.equal(scoreResearchFreshness(new Date(now-169*3600_000).toISOString(),now),35);
assert.equal(scoreResearchFreshness(new Date(now+1000).toISOString(),now),0,"Future quotes must never score 100");
assert.equal(scoreResearchFreshness("2026-10-14T23:00:00.000Z",now),0);
for(const invalid of ["2026-02-30T12:00:00.000Z","2026-13-14T19:00:00.000Z",
  "2026-10-14 17:00:00", "invalid", 1234, true, "1999-12-31T23:59:59.000Z"]){
 assert.equal(scoreResearchFreshness(invalid,now),30,String(invalid));
}
assert.equal(scoreResearchFreshness(null,now),35);
assert.equal(scoreResearchFreshness("",now),35);
assert.throws(()=>scoreResearchFreshness(observed,NaN),/INVALID_COMMITTEE_CLOCK/);

for(const v of [null,undefined,"","  ",0,"0",-10,Infinity,-Infinity,NaN,{},true,false,[]]){
 assert.equal(positiveResearchReferencePrice(v),null,`Invalid price ${String(v)}`);
}
for(const [a,b] of [[100,100],["23.50",23.5],[" 13.2 ",13.2],[0.001,0.001]]){
 assert.equal(positiveResearchReferencePrice(a),b);
}
const runner = await readFile(new URL("./run-investment-committee.mjs",import.meta.url),"utf8");
assert.match(runner,/scoreResearchFreshness\(asset\.technical\?\.observedAt \?\? asset\.observedAt, now\.getTime\(\)\)/);
assert.match(runner,/const referencePrice = positiveResearchReferencePrice\(asset\.price\)/);
assert.match(runner,/referencePrice === null \? 'ATTENDI' : decisionFor/);
assert.match(runner,/currentPrice: referencePrice/);
assert.match(runner,/price !== null && decision === 'COMPRA'/);
assert.doesNotMatch(runner,/const hours = Math\.max\(0, \(Date\.now\(\) - timestamp\)/);
const campaign = JSON.parse(await readFile(new URL("../data/paper-validation-campaign.json",import.meta.url),"utf8"));
assert.equal(campaign.liveTradingAllowed,false);
assert.equal(campaign.baselineFingerprint.complete,true);
for(const file of ["scripts/run-investment-committee.mjs","lib/intelligence/committee-input-integrity.mjs",
 "scripts/run-decision-ledger.mjs","app/committee/page.tsx",
 "scripts/test-committee-input-integrity.mjs"])
 assert.equal(campaign.baselineFingerprint.files.includes(file),false,
  "Must stay outside frozen V6 PAPER fingerprint: "+file);
const real = JSON.parse(await readFile(new URL("../data/investment-committee.json",import.meta.url),"utf8"));
const rows=real.allDecisions||[];
assert.ok(rows.length>=5,"Real research dataset must be sampled");
for(const row of rows){
 if(row.currentPrice!==null&&row.currentPrice!==undefined){
   assert.equal(positiveResearchReferencePrice(row.currentPrice),row.currentPrice,
     "Current valid market references should be stable: "+row.symbol);
 }
}

const t = Date.parse("2026-10-20T12:00:00.000Z");
const sampleBook = {
  mode: "live", generatedAt: "2026-10-18T12:00:00.000Z",
  assets: [{
    symbol: "ASML", observedAt: "2026-10-16T00:00:00.000Z", status: "operativo",
    conclusion: "ROBUSTA", bestFamily: "trend",
    families: [{ id: "trend", verdict: "ROBUSTA", robustnessScore: 98,
      medianOutOfSampleExcessPercent: 22.2,
      medianOutOfSampleDrawdownImprovementPercent: -3.2,
      selectedVariantId: "trend-60-220",
      variants: [{ id: "trend-60-220", parameters: {fast:60,slow:220} }] }]
  }]
};
const frozen = JSON.stringify(sampleBook);
const strategy = researchStrategySnapshot(sampleBook, "ASML", t);
assert.equal(strategy?.kind, "HISTORICAL_OOS_RESEARCH_ONLY");
assert.equal(strategy?.historicalMedianOosExcessAnnualizedPercent, 22.2);
assert.equal(strategy?.historicalMedianOosDrawdownImprovementPoints, -3.2);
assert.deepEqual(strategy?.parameters, {fast:60,slow:220});
assert.equal(strategy?.executionAuthorized, false);
assert.equal(strategy?.affectsCommitteeScore, false);
assert.equal(strategy?.profitableStrategyVerified, false);
assert.equal(JSON.stringify(sampleBook), frozen, "Evidence selection must not mutate the Strategy Lab.");
const invalidBook = mutate => {
  const copy = structuredClone(sampleBook);
  mutate(copy);
  assert.equal(researchStrategySnapshot(copy, "ASML", t), null);
};
invalidBook(x => { x.generatedAt = "2026-10-21T12:00:00.000Z"; });
invalidBook(x => { x.generatedAt = "2026-02-30T12:00:00.000Z"; });
invalidBook(x => { x.generatedAt = "2026-10-01T12:00:00.000Z"; });
invalidBook(x => { x.assets[0].conclusion = "INSUFFICIENTE"; });
invalidBook(x => { x.assets[0].families[0].verdict = "FRAGILE"; });
invalidBook(x => { x.assets[0].families[0].selectedVariantId = "missing"; });
invalidBook(x => { x.assets[0].families[0].medianOutOfSampleExcessPercent = Infinity; });
invalidBook(x => { x.assets[0].observedAt = "2026-10-19T00:00:00.000Z"; });
invalidBook(x => { x.assets.push(structuredClone(x.assets[0])); });
assert.equal(researchStrategySnapshot(sampleBook, "SPY", t), null);
const ledgerRunner = await readFile(new URL("./run-decision-ledger.mjs",import.meta.url),"utf8");
assert.match(ledgerRunner,/strategyResearch: decision\.strategyResearch \?\? null/);
const committeePage = await readFile(new URL("../app/committee/page.tsx",import.meta.url),"utf8");
assert.match(committeePage,/Strategy Lab · storico, non operativo/);
assert.match(runner,/researchStrategySnapshot\(strategies, asset\.symbol, now\.getTime\(\)\)/);

console.log("Fenice Committee timestamp and strategy vintage, V6 isolation: PASS");
