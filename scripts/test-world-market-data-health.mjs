import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildWorldMarketDataHealth} from '../lib/ui/world-market-data-health.mjs';
import {readLatestWorldTacticalEvidence} from '../lib/ui/one-global-world-radar-runtime.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name+'.json',import.meta.url),'utf8'));
const fallback={terminal:read('terminal-intelligence'),ledger:read('one-global-forward-research-ledger'),
  health:read('global-source-health'),eod:read('world-v7-eod-research'),
  master:read('instrument-master'),seeds:read('world-paper-v7-research-seeds')};
const nowIso=new Date(Math.max(...['terminal','health','eod'].map(k=>Date.parse(fallback[k].generatedAt)))+60000).toISOString();
const health=buildWorldMarketDataHealth({...fallback,nowIso});
assert.equal(health.availability.scope,'GENERAL_ENDPOINT_REACHABILITY_ONLY');
assert.equal(health.availability.impliesQuoteQuality,false);
assert.equal(health.availability.impliesPaperRights,false);
assert.equal(health.markets.length,16);
assert(health.research.marketsWithRecentDailyResearch>=10);
assert(health.markets.every(m=>m.publicExecutionAdmissionVerified===false&&m.liveTradingAllowed===false));
for(const mic of ['XTSE','XLON']){
  assert.equal(health.markets.find(m=>m.mic===mic).listedResearchEquities,1);
  assert.equal(health.markets.find(m=>m.mic===mic).publicExecutionAdmissionVerified,false);
}
// A successful general endpoint must not turn absent equity history into data.
const healthyOnly=buildWorldMarketDataHealth({...fallback,terminal:null,eod:null,nowIso});
assert.equal(healthyOnly.research.marketsWithRecentDailyResearch,0);
assert(healthyOnly.availability.healthy>0);
const polluted=structuredClone(fallback);
polluted.terminal.assets=polluted.terminal.assets.map(a=>({...a,assetClass:'Criptovaluta'}));
polluted.eod=null;
assert.equal(buildWorldMarketDataHealth({...polluted,nowIso}).research.recentTechnicalEquities,0);
const stale=buildWorldMarketDataHealth({...fallback,nowIso:new Date(Date.parse(nowIso)+8*86400000).toISOString()});
assert.equal(stale.research.marketsWithRecentDailyResearch,0);
assert.equal(stale.availability.healthy,0);
const invalid=structuredClone(fallback);
invalid.eod.records.XMIL.lastCompleteBarDate='2026-99-99';
assert.equal(buildWorldMarketDataHealth({...invalid,nowIso}).markets.find(m=>m.mic==='XMIL').lastCompletedResearchSession,null);
const files={'terminal-intelligence.json':fallback.terminal,'one-global-forward-research-ledger.json':fallback.ledger,
  'global-source-health.json':fallback.health,'world-v7-eod-research.json':fallback.eod};
const calls=[];
const fetcher=async(url,options)=>{
  assert(url.startsWith('https://raw.githubusercontent.com/romitoorazio/fenice-investment-system/main/data/'));
  assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');calls.push(url);
  return Response.json(files[url.split('/').at(-1)]);
};
const current=await readLatestWorldTacticalEvidence({fallback,nowIso,fetcher});
assert.equal(calls.length,4);assert.match(current.source,/GitHub main/);
assert(current.radar.watchlist.length>=8);
assert.equal(current.radar.policy.paperExecutionAllowed,false);
assert.equal(current.radar.policy.liveTradingAllowed,false);
assert.doesNotMatch(JSON.stringify(current),/"(?:close|open|high|low|volume|bidPrice|rawPayload|bodyBase64)"/);
const offline=await readLatestWorldTacticalEvidence({fallback,nowIso,fetcher:async()=>{throw Error('SECRET_UPSTREAM_ERROR');}});
assert.match(offline.source,/Snapshot incluso/);assert.deepEqual(offline.radar,current.radar);
assert.doesNotMatch(JSON.stringify(offline),/SECRET_UPSTREAM_ERROR/);
const broken=structuredClone(fallback);broken.ledger.events[0].close*=1.02;
const denied=await readLatestWorldTacticalEvidence({fallback:broken,nowIso,fetcher:async()=>new Response('x',{status:503})});
assert.equal(denied.radar,null);assert.equal(denied.dataHealth,null);
const oversized=await readLatestWorldTacticalEvidence({fallback,nowIso,
  fetcher:async()=>new Response('{}',{headers:{'content-length':'3000001'}})});
assert.match(oversized.source,/Snapshot incluso/);
console.log('PASS world health/runtime: reachability != equity quality != private PAPER, all 16 markets, crypto exclusion, staleness, hash replay, bounded public refresh and explicit fallback.');
