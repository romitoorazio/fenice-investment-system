import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {assessOneGlobalEodOpenPreflight as check}
  from "./assess-one-global-eod-open-preflight.mjs";
const time="2026-11-12T13:50:00.000Z"; // 14:50 Rome; 08:50 New York
const eod={mode:"WORLD_V7_EOD_RESEARCH_ONLY",liveTradingAllowed:false,
  generatedAt:time,records:{
    XMIL:{status:"MISSING_DAILY_SYMBOL_METADATA",yahooFallbackStatus:"YAHOO_INVALID_OHLC"},
    XTKS:{status:"TENTATIVE_COMPLETED_DAILY_RESEARCH"},
  }};
const provider={mode:"PROVIDER_ACCESS_DIAGNOSTIC_ONLY",liveTradingAllowed:false,records:{}};
const committee={engine:"Fenice Investment Committee v1",generatedAt:time,buyCandidateCount:0};
const r=check({nowIso:time,eod,provider,committee,ownerPaperConsent:true});
assert.deepEqual(r.marketWindowsExpected,["XMIL","XETR"],
  "14:50 CET is a European regular session window, NOT a New York opening");
assert.equal(r.ownerConsentScope,"PRIVATE_VIRTUAL_PAPER_ONLY");
assert.equal(r.nearTermDecision,"NO_PAPER_ORDER");
assert.equal(r.committeeBuyCandidates,0);
assert.equal(r.independentProviderReceiptsVerified,0);
assert.equal(r.virtualBuys,0);
assert.equal(r.certifiedTrades,0);
assert.equal(r.phase9CertificationCredit,0);
assert.equal(r.liveTradingAllowed,false);
assert.equal(r.brokerConnectivityAllowed,false);
assert.equal(r.noDirectaSubmission,true);
assert.equal(r.noRawPricesPublished,true);
assert.equal(r.venues.length,5);
for(const item of r.venues){
  assert.equal(item.actualExchangeOpenProven,false);
  assert.equal(item.eodPaperFillRecorded,false);
  assert.equal(item.paperSignalCommitted,false);
  assert(item.blockers.includes("EXCHANGE_SESSION_NOT_INDEPENDENTLY_CONFIRMED"));
  assert(item.blockers.includes("TWO_INDEPENDENT_PUBLISHED_CLOSE_RECEIPTS_MISSING"));
  assert(item.blockers.includes("NO_COMMITTEE_COMPRA_SIGNAL"));
}
assert.equal(r.venues.find(v=>v.mic==="XMIL").exchangeLocalTime,"14:50");
for(const [status,hasCompletedResearch] of [
  ["MISSING_DAILY_SYMBOL_METADATA",false],["YAHOO_INVALID_OHLC",false],
  ["RETURNED_SYMBOL_MISMATCH",false],["TENTATIVE_COMPLETED_DAILY_RESEARCH",true],
  ["COMPLETE_EOD_RESEARCH",true],
]){
  const snapshot={...eod,records:{...eod.records,XMIL:{status}}};
  const observed=check({nowIso:time,eod:snapshot,provider,committee,
    ownerPaperConsent:true}).venues.find(v=>v.mic==="XMIL");
  assert.equal(observed.sourceStatus,status);
  assert.equal(observed.blockers.includes("COMPLETED_EOD_PROVIDER_DATA_MISSING"),!hasCompletedResearch);
  assert(observed.blockers.includes("EOD_DATA_USAGE_RIGHTS_NOT_CERTIFIED"));
  assert(observed.blockers.includes("TWO_INDEPENDENT_PUBLISHED_CLOSE_RECEIPTS_MISSING"));
  assert(observed.blockers.includes("EXACT_MIC_AND_PROVIDER_SYMBOL_NOT_CERTIFIED"));
  assert.equal(observed.eodPaperFillRecorded,false);
}
const tokyo=r.venues.find(x=>x.mic==="XTKS");
assert.equal(tokyo.regularWindowExpected,false);
// Research observations are refreshed on main. Tokyo may now have a valid
// Yahoo research-only EOD fallback even when Alpha Vantage access is invalid.
// A research status must not be confused with independent PAPER admissibility.
assert.equal(tokyo.sourceStatus,eod.records.XTKS?.status??"NOT_OBSERVED");
assert.equal(tokyo.eodPaperFillRecorded,false);
assert(tokyo.blockers.includes("EXCHANGE_SESSION_NOT_INDEPENDENTLY_CONFIRMED"));
assert(tokyo.blockers.includes("TWO_INDEPENDENT_PUBLISHED_CLOSE_RECEIPTS_MISSING"));
assert(tokyo.blockers.includes("EOD_DATA_USAGE_RIGHTS_NOT_CERTIFIED"));
// Both observed states must keep execution blocked, independent of daily data.
for(const status of ["INVALID_SYMBOL_OR_ACCESS","TENTATIVE_COMPLETED_DAILY_RESEARCH"]){
  const fixture=structuredClone(eod);
  fixture.records.XTKS={...fixture.records.XTKS,status,exactMicCertified:false,
    licensedPaperSource:false};
  const observed=check({nowIso:time,eod:fixture,provider,committee,
    ownerPaperConsent:true}).venues.find(v=>v.mic==="XTKS");
  assert.equal(observed.sourceStatus,status);
  assert.equal(observed.eodPaperFillRecorded,false);
  assert.equal(observed.paperSignalCommitted,false);
  assert(observed.blockers.includes("EOD_DATA_USAGE_RIGHTS_NOT_CERTIFIED"));
  assert(observed.blockers.includes("TWO_INDEPENDENT_PUBLISHED_CLOSE_RECEIPTS_MISSING"));
}
assert(r.venues.find(x=>x.mic==="XETR").regularWindowExpected);
assert(r.venues.find(x=>x.mic==="XNYS").regularWindowExpected===false);
const nyOpen=check({nowIso:"2026-11-12T14:40:00.000Z",
  eod,provider,committee,ownerPaperConsent:true});
assert.deepEqual(nyOpen.marketWindowsExpected,["XMIL","XETR","XNYS","XNAS"]);
assert.equal(nyOpen.nearTermDecision,"NO_PAPER_ORDER");
const early=check({nowIso:"2026-11-12T14:29:00.000Z",eod,provider,committee,
  ownerPaperConsent:true});
assert.equal(early.venues.find(v=>v.mic==="XNYS").regularWindowExpected,false);
const saturday=check({nowIso:"2026-11-14T13:50:00.000Z",eod,provider,committee,
  ownerPaperConsent:true});
assert.equal(saturday.marketWindowsExpected.length,0,"weekday calendars fail closed");

// Official 23–27 Nov 2026 timetable must not advertise ordinary sessions
// on the JPX holiday, US Thanksgiving or after the 13:00 ET early close.
// These are read-only clock diagnostics, not authorization or live evidence.
const holidayTokyo=check({nowIso:"2026-11-23T01:30:00.000Z",
  eod,provider,committee,ownerPaperConsent:true});
const tokyoHoliday=holidayTokyo.venues.find(v=>v.mic==="XTKS");
assert.equal(tokyoHoliday.regularWindowExpected,false);
assert(tokyoHoliday.blockers.includes("PUBLISHED_2026_VENUE_HOLIDAY"));
assert.equal(tokyoHoliday.paperSignalCommitted,false);
const tokyoFollowingDay=check({nowIso:"2026-11-24T01:30:00.000Z",
  eod,provider,committee,ownerPaperConsent:true});
assert.equal(tokyoFollowingDay.venues.find(v=>v.mic==="XTKS").regularWindowExpected,true);
assert.equal(tokyoFollowingDay.venues.find(v=>v.mic==="XTKS").actualExchangeOpenProven,false);
const usThanksgiving=check({nowIso:"2026-11-26T15:30:00.000Z",
  eod,provider,committee,ownerPaperConsent:true});
for(const mic of ["XNYS","XNAS"]){
  const closed=usThanksgiving.venues.find(v=>v.mic===mic);
  assert.equal(closed.regularWindowExpected,false);
  assert(closed.blockers.includes("PUBLISHED_2026_VENUE_HOLIDAY"));
}
const beforeEarlyClose=check({nowIso:"2026-11-27T17:15:00.000Z",
  eod,provider,committee,ownerPaperConsent:true});
const afterEarlyClose=check({nowIso:"2026-11-27T18:15:00.000Z",
  eod,provider,committee,ownerPaperConsent:true});
for(const mic of ["XNYS","XNAS"]){
  assert.equal(beforeEarlyClose.venues.find(v=>v.mic===mic).regularWindowExpected,true);
  const early=afterEarlyClose.venues.find(v=>v.mic===mic);
  assert.equal(early.regularWindowExpected,false);
  assert(early.blockers.includes("PUBLISHED_2026_EARLY_CLOSE"));
  assert.equal(early.actualExchangeOpenProven,false);
}

const unauthorised=check({nowIso:time,eod,provider,committee,ownerPaperConsent:false});
assert(unauthorised.venues.every(v=>v.blockers.includes("OWNER_PAPER_CONSENT_NOT_PRESENT")));
assert(unauthorised.marketWindowsExpected.length===2);
const fresher=structuredClone(eod);
fresher.records.XMIL={status:"COMPLETE_EOD_RESEARCH",exactMicCertified:true,
  providerSymbolConfirmed:true,licensedPaperSource:true};
const committeeBull={...committee,buyCandidateCount:10};
const selfCertified=check({nowIso:time,eod:fresher,provider,committee:committeeBull,
  ownerPaperConsent:true});
const milan=selfCertified.venues.find(v=>v.mic==="XMIL");
assert(milan.blockers.includes("TWO_INDEPENDENT_PUBLISHED_CLOSE_RECEIPTS_MISSING"));
assert(milan.blockers.includes("EXCHANGE_SESSION_NOT_INDEPENDENTLY_CONFIRMED"));
assert.equal(milan.eodPaperFillRecorded,false,"one EOD record and BUY candidates do not grant fills");
assert.throws(()=>check({nowIso:"not-a-clock",eod,provider,committee}),
  /EOD_OPEN_PREFLIGHT_INPUT_INVALID/);
assert.throws(()=>check({nowIso:time,eod,provider,committee:{
  ...committee,engine:"UNTRUSTED"}}),/EOD_OPEN_PREFLIGHT_INPUT_INVALID/);
const raw=execFileSync(process.execPath,[
  "scripts/assess-one-global-eod-open-preflight.mjs","--paper-only-owner-consent"
],{encoding:"utf8"});
const cli=JSON.parse(raw);
const latestEod=JSON.parse(readFileSync("data/world-v7-eod-research.json","utf8"));
assert.equal(cli.venues.find(v=>v.mic==="XMIL").sourceStatus,
  latestEod.records?.XMIL?.status??"NOT_OBSERVED");
assert.equal(cli.noRawPricesPublished,true);
assert.equal(cli.liveTradingAllowed,false);
assert.equal(cli.brokerConnectivityAllowed,false);
assert.equal(cli.paperFills,0);
assert.equal(cli.certifiedTrades,0);
assert.equal(cli.consent,"PRIVATE_VIRTUAL_PAPER_ONLY");
assert(!JSON.stringify(cli).includes("9.852"),"no web market prices redistributed");
console.log("PASS EOD live-clock pilot: Milan/Xetra 14:50 CET, NY before 15:30 CET; owner PAPER consent never bypasses source/strategy/Phase9 gates; no Directa");
