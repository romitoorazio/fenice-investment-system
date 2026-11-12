import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {assessOneGlobalEodOpenPreflight as check}
  from "./assess-one-global-eod-open-preflight.mjs";
const eod=JSON.parse(readFileSync("data/world-v7-eod-research.json","utf8"));
const provider=JSON.parse(readFileSync("data/world-v7-provider-observation.json","utf8"));
const committee=JSON.parse(readFileSync("data/investment-committee.json","utf8"));
const time="2026-11-12T13:50:00.000Z"; // 14:50 Rome; 08:50 New York
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
const madrid=r.venues.find(x=>x.mic==="XMIL");
assert.equal(madrid.exchangeLocalTime,"14:50");
assert.equal(madrid.sourceStatus,"RETURNED_SYMBOL_MISMATCH");
assert(madrid.blockers.includes("EXACT_MIC_AND_PROVIDER_SYMBOL_NOT_CERTIFIED"));
const tokyo=r.venues.find(x=>x.mic==="XTKS");
assert.equal(tokyo.regularWindowExpected,false);
assert.equal(tokyo.sourceStatus,"INVALID_SYMBOL_OR_ACCESS");
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
assert.equal(cli.noRawPricesPublished,true);
assert.equal(cli.liveTradingAllowed,false);
assert.equal(cli.brokerConnectivityAllowed,false);
assert.equal(cli.paperFills,0);
assert.equal(cli.certifiedTrades,0);
assert.equal(cli.consent,"PRIVATE_VIRTUAL_PAPER_ONLY");
assert(!JSON.stringify(cli).includes("9.852"),"no web market prices redistributed");
console.log("PASS EOD live-clock pilot: Milan/Xetra 14:50 CET, NY before 15:30 CET; owner PAPER consent never bypasses source/strategy/Phase9 gates; no Directa");
