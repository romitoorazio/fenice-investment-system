import assert from "node:assert/strict";
import { runWorldPaperV7 } from "../lib/trading/world-paper-v7.mjs";

const H = "a".repeat(64);
const entitlement = (until) => ({
  status: "VERIFIED", usageScope: "NON_DISPLAY_INTERNAL", automatedUseAllowed: true,
  dualControlVerified: true, evidenceRef: "contract://operator/approved-v7-test",
  evidenceSha256: H, validUntil: until,
});
const tTokyo = "2026-10-19T02:00:00.000Z";
const tItaly = "2026-10-19T09:00:00.000Z";
const expires = "2026-11-19T00:00:00.000Z";
const instrument = (ticker, exchangeMic, currency, region, country) =>
  ({ ticker, exchangeMic, currency, region, country, status: "active", assetClass: "equity" });
const assetTokyo = instrument("7203","XTKS","JPY","asia-pacific","JP");
const assetChina = instrument("600519","XSHG","CNY","asia-pacific","CN");
const assetMilan = instrument("ENEL","XMIL","EUR","europe","IT");
const assets = [assetTokyo,assetChina,assetMilan];
const families = ["provider-one","provider-two"];
const registry = {
  sources: assets.flatMap(a => families.map(sourceFamily => ({
    sourceFamily, provider: sourceFamily, exchangeMic: a.exchangeMic, currency: a.currency,
    evidenceRef: entitlement(expires).evidenceRef, evidenceSha256: H,
    automatedUseAllowed: true, usageScope: "NON_DISPLAY_INTERNAL", validUntil: expires,
  }))),
  sessions: assets.map(a => ({ exchangeMic: a.exchangeMic, source: "licensed-venue-clock",
    marketStateEntitled: true, validUntil: expires })),
  fx: [
    { from:"JPY", to:"EUR", sourceFamily:"approved-fx", paperUseAllowed:true, validUntil:expires },
    { from:"CNY", to:"EUR", sourceFamily:"approved-fx", paperUseAllowed:true, validUntil:expires },
  ],
};
const evidence = (asset, now, price) => families.map((sourceFamily,i) => ({
  symbol: asset.ticker, exchangeMic: asset.exchangeMic, currency: asset.currency,
  sourceFamily, provider:sourceFamily, price:price*(i ? 1.0001 : 1),
  observedAt: new Date(Date.parse(now)-8_000).toISOString(),
  realtime:true, provenanceVerified:true, exactVenueVerified:true,
  entitlement:entitlement(expires),
}));
const session = (asset,now) => ({ exchangeMic:asset.exchangeMic, source:"licensed-venue-clock",
  state:"OPEN", authoritative:true, observedAt:new Date(Date.parse(now)-10_000).toISOString() });
const fx = (from,rate,now)=>({from,to:"EUR",rate,sourceFamily:"approved-fx",
  observedAt:new Date(Date.parse(now)-20_000).toISOString(),realtime:true,provenanceVerified:true});
const intent = (asset,now,id) => ({
  id, symbol:asset.ticker, exchangeMic:asset.exchangeMic, side:"BUY",maxNotionalEuro:40,
  approvedForWorldPaper:true,strategyId:"sample-strategy-v7",
  createdAt:new Date(Date.parse(now)-12_000).toISOString(),
});
const tokyoInput={
  nowIso:tTokyo,instruments:assets,
  sessions:[session(assetTokyo,tTokyo),session(assetChina,tTokyo)],
  quotes:[...evidence(assetTokyo,tTokyo,2000),...evidence(assetChina,tTokyo,1800)],
  fx:[fx("JPY",.006,tTokyo),fx("CNY",.13,tTokyo)],entitlements:registry,
  intents:[intent(assetTokyo,tTokyo,"tokyo-test-001")],
};
const raw=runWorldPaperV7(tokyoInput);
assert.equal(raw.summary.filledPaperOrders,0, "explicit PAPER authorization always required");
assert.equal(raw.summary.independentlyVerifiedListings,2, "Asia pilot must be independently verifiable");
assert.equal(raw.regions.find(r=>r.region==="asia-pacific").verifiedPaperListings,2);
assert.equal(raw.regions.find(r=>r.region==="europe").verifiedPaperListings,0);
assert.equal(raw.liveTradingAllowed,false);
assert.equal(raw.brokerConnectivityAllowed,false);
assert.equal(raw.modifiesV6,false);
const badRights=runWorldPaperV7({...tokyoInput,entitlements:{...registry,sources:[]} ,paperRunAuthorized:true});
assert.equal(badRights.summary.filledPaperOrders,0);
assert.equal(badRights.summary.independentlyVerifiedListings,0);
const buy=runWorldPaperV7({...tokyoInput,paperRunAuthorized:true});
assert.equal(buy.summary.filledPaperOrders,1);
assert.equal(buy.fills[0].key,"XTKS:7203");
assert.equal(buy.fills[0].simulated,true);
assert.equal(buy.fills[0].liveTradingAllowed,false);
assert(buy.paperLedger.cashEuro < 1000);
assert(buy.paperLedger.cashEuro > 950);
const repeated=runWorldPaperV7({...tokyoInput,paperRunAuthorized:true,previousLedger:buy.paperLedger});
assert.equal(repeated.summary.filledPaperOrders,0,"same intent cannot be replayed");
assert(repeated.rejectedIntents[0].reasons.includes("DUPLICATE_OR_INVALID_INTENT_ID"));
const tampered=structuredClone(buy.paperLedger);
tampered.events[0].notionalEuro=999999;
assert.throws(()=>runWorldPaperV7({...tokyoInput,previousLedger:tampered}),/INVALID_WORLD_PAPER_LEDGER/);
const afterTokyo=runWorldPaperV7({
  nowIso:tItaly,instruments:assets,sessions:[session(assetMilan,tItaly)],
  quotes:evidence(assetMilan,tItaly,8),fx:[],entitlements:registry,
  previousLedger:buy.paperLedger,paperRunAuthorized:true,
  intents:[intent(assetMilan,tItaly,"milan-test-001")],
});
assert.equal(afterTokyo.summary.filledPaperOrders,1);
assert.equal(afterTokyo.fills[0].key,"XMIL:ENEL");
assert.equal(afterTokyo.paperLedger.events.length,2,"Asia and Europe share ONE isolated portfolio");
assert.equal(afterTokyo.summary.independentlyVerifiedListings,1);
const staleClock=runWorldPaperV7({
  ...tokyoInput,paperRunAuthorized:true,
  sessions:[{...session(assetTokyo,tTokyo),observedAt:"2026-10-19T01:30:00.000Z"},session(assetChina,tTokyo)],
});
assert.equal(staleClock.summary.filledPaperOrders,0);
const wrongVenue=runWorldPaperV7({
  ...tokyoInput,paperRunAuthorized:true,
  sessions:[{...session(assetTokyo,tTokyo),exchangeMic:"XNAS"},session(assetChina,tTokyo)],
});
assert.equal(wrongVenue.summary.filledPaperOrders,0);
const noFx=runWorldPaperV7({...tokyoInput,paperRunAuthorized:true,fx:[]});
assert.equal(noFx.summary.filledPaperOrders,0);
const oneFamily=runWorldPaperV7({...tokyoInput,paperRunAuthorized:true,
  quotes:tokyoInput.quotes.filter(x=>x.sourceFamily==="provider-one")});
assert.equal(oneFamily.summary.filledPaperOrders,0);
const staleQuotes=runWorldPaperV7({...tokyoInput,paperRunAuthorized:true,
  quotes:tokyoInput.quotes.map(x=>({...x,observedAt:"2026-10-18T10:00:00.000Z"}))});
assert.equal(staleQuotes.summary.filledPaperOrders,0);
const crossCurrency=runWorldPaperV7({...tokyoInput,paperRunAuthorized:true,
  quotes:tokyoInput.quotes.map(x=>({...x,currency:"USD"}))});
assert.equal(crossCurrency.summary.filledPaperOrders,0);
const divergent=runWorldPaperV7({...tokyoInput,paperRunAuthorized:true,
  quotes:tokyoInput.quotes.map(x=>x.symbol==="7203" && x.sourceFamily==="provider-two" ? {...x,price:2600}:x)});
assert.equal(divergent.summary.filledPaperOrders,0);
const wrongEntitlement=runWorldPaperV7({...tokyoInput,paperRunAuthorized:true,
  quotes:tokyoInput.quotes.map(x=>({...x,entitlement:{...x.entitlement,evidenceSha256:"f".repeat(64)}}))});
assert.equal(wrongEntitlement.summary.filledPaperOrders,0);
const doubleIdentifier=runWorldPaperV7({...tokyoInput,paperRunAuthorized:true,
  instruments:[...assets,assetTokyo]});
assert.equal(doubleIdentifier.summary.filledPaperOrders,0);
assert(doubleIdentifier.listings.some(x=>x.reasons.includes("DUPLICATE_LISTING_IDENTITY")));
const noPositions=runWorldPaperV7({...tokyoInput,paperRunAuthorized:true,
  intents:[{...intent(assetTokyo,tTokyo,"tokyo-test-sell"),side:"SELL"}]});
assert.equal(noPositions.summary.filledPaperOrders,0,"cannot sell stock not held");
const staleIntent=runWorldPaperV7({...tokyoInput,paperRunAuthorized:true,
  intents:[{...intent(assetTokyo,tTokyo,"tokyo-test-stale"),createdAt:"2026-10-18T02:00:00.000Z"}]});
assert.equal(staleIntent.summary.filledPaperOrders,0);
assert.throws(()=>runWorldPaperV7({...tokyoInput,nowIso:"2026-10-19"}),/INVALID_WORLD_PAPER_CLOCK/);
const researchOnly=runWorldPaperV7({...tokyoInput,paperRunAuthorized:true,
  instruments:[{...assetTokyo,paperExecutionAllowed:false},assetChina,assetMilan]});
assert.equal(researchOnly.summary.filledPaperOrders,0,"reference-only non-US seeds never become PAPER fills");
assert(researchOnly.listings.find(x=>x.key==="XTKS:7203").reasons.includes("LISTING_RESEARCH_ONLY_UNTIL_APPROVED"));
const noData=runWorldPaperV7({nowIso:tTokyo,instruments:assets,entitlements:{},paperRunAuthorized:true});
assert.equal(noData.summary.independentlyVerifiedListings,0);
assert.equal(noData.summary.filledPaperOrders,0);
assert(noData.regions.find(x=>x.region==="asia-pacific"));
console.log("WORLD PAPER V7 isolation, venue, multi-region ledger and fail-closed cases: PASS (18 checks)");
