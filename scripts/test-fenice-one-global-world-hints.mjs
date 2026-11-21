import assert from "node:assert/strict";
import {assessGlobalVenueStateHints} from "../lib/global/world-market-observation-bridge.mjs";
const stamp="2026-11-07T07:24:36.978Z",nowIso="2026-11-07T08:24:36.978Z";
const mics=["XHKG","XSHG","XNSE","XMIL","XETR","XLON","XNYS","XNAS","XJPX"];
const records=Object.fromEntries(mics.map(mic=>[mic,{
 stateMic:mic,exactMicState:true,authoritativeSessionVerified:false,
 state:"PROVIDER_REPORTED_CLOSED",quoteStatus:"NO_OPEN_SESSION_HINT"
}]));
const source={version:1,mode:"WORLDWIDE_RESEARCH_DIAGNOSTIC",observedAt:stamp,
 marketStateAvailable:true,venuesTracked:136,venuesWithExactState:136,quoteRequests:0,
 paperEligible:false,liveTradingAllowed:false,brokerConnectivityAllowed:false,records};
const check=({s=source,now=nowIso}={})=>assessGlobalVenueStateHints({source:s,nowIso:now});
const good=check();
assert.equal(good.ok,true);
assert.equal(good.sourceFresh,true);
assert.equal(good.sourceVenuesTracked,136);
assert.equal(good.sourceQuoteRequests,0);
assert.equal(good.totals.requested,9);
assert.equal(good.totals.exactMicHints,8);
assert.equal(good.totals.operatingMicOnlyHints,1);
assert.equal(good.totals.notObserved,0);
assert.deepEqual(good.regions.ASIA,{requested:4,exactMicHints:3,operatingMicOnlyHints:1,
 notObserved:0,providerReportedOpen:0,providerReportedClosed:4,
 authoritativeSessions:0,verifiedQuotes:0,certifiedPaperFills:0});
assert.equal(good.regions.EUROPE.requested,3);
assert.equal(good.regions.AMERICAS.requested,2);
const tokyo=good.rows.find(row=>row.mic==="XTKS");
assert.equal(tokyo.sourceMic,"XJPX");
assert.equal(tokyo.mapping,"OPERATING_MIC_ONLY");
assert.equal(tokyo.reason,"OPERATING_MIC_NOT_SEGMENT_CALENDAR");
assert.equal(tokyo.authoritativeSessionVerified,false);
assert.equal(tokyo.quotesValidated,0);
assert.equal(tokyo.paperEligible,false);
assert.equal(good.paperEligible,false);
assert.equal(good.countsTowardRealPaper,false);
assert.equal(good.liveTradingAllowed,false);
const milan=good.rows.find(row=>row.mic==="XMIL");
assert.equal(milan.mapping,"EXACT_MIC");
assert.equal(milan.providerReportedState,"PROVIDER_REPORTED_CLOSED");
assert.equal(milan.authoritativeSessionVerified,false);
// A provider-reported OPEN is still NOT an authoritative exchange session.
const opened=check({s:{...source,records:{...records,XJPX:{...records.XJPX,state:"PROVIDER_REPORTED_OPEN"},
 XMIL:{...records.XMIL,state:"PROVIDER_REPORTED_OPEN"}}}});
assert.equal(opened.regions.ASIA.providerReportedOpen,1);
assert.equal(opened.rows.find(row=>row.mic==="XTKS").paperEligible,false);
assert.equal(opened.rows.find(row=>row.mic==="XMIL").reason,"PROVIDER_HINT_NOT_AUTHORITATIVE");
assert.equal(opened.totals.authoritativeSessions,0);
const exactTokyo=check({s:{...source,records:{...records,XTKS:{...records.XJPX,stateMic:"XTKS"}}}});
assert.equal(exactTokyo.rows.find(row=>row.mic==="XTKS").mapping,"EXACT_MIC");
assert.equal(exactTokyo.totals.exactMicHints,9);
assert.equal(exactTokyo.totals.operatingMicOnlyHints,0);
const noOperator=check({s:{...source,records:Object.fromEntries(Object.entries(records).filter(([mic])=>mic!=="XJPX"))}});
assert.equal(noOperator.rows.find(row=>row.mic==="XTKS").mapping,"NOT_OBSERVED");
assert.equal(noOperator.rows.find(row=>row.mic==="XTKS").reason,"VENUE_NOT_OBSERVED");
// Never imply a state from expired observations or future-dated reports.
const stale=check({now:"2026-11-08T08:24:36.978Z"});
assert.equal(stale.ok,true);
assert.equal(stale.sourceFresh,false);
assert.equal(stale.rows.every(row=>row.providerReportedState===null),true);
assert.equal(stale.rows.every(row=>row.reason==="SOURCE_STALE"),true);
assert.equal(check({now:"2026-11-07T06:00:00.000Z"}).reason,"SOURCE_TIMESTAMP_INVALID_OR_FUTURE");
for(const modification of [
 {paperEligible:true},{liveTradingAllowed:true},{brokerConnectivityAllowed:true},
 {marketStateAvailable:false},{mode:"CERTIFIED_SESSION"},{quoteRequests:-1},
 {records:[]},{records:null}
]) assert.equal(check({s:{...source,...modification}}).reason,"SOURCE_REPORT_NOT_SAFE");
assert.equal(check({now:"bad-date"}).reason,"INVALID_OBSERVATION_POLICY");
// An unverified exact MIC MUST NOT be reinterpreted as authoritative.
const forged=check({s:{...source,records:{...records,XMIL:{...records.XMIL,authoritativeSessionVerified:true}}}});
assert.equal(forged.rows.find(row=>row.mic==="XMIL").mapping,"NOT_OBSERVED");
assert.equal(forged.totals.authoritativeSessions,0);
console.log("Fenice ONE GLOBAL read-only worldwide market-state bridge contracts: PASS");
