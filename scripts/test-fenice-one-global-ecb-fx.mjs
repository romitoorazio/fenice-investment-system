import assert from "node:assert/strict";
import {ECB_DAILY_FX_URL,parseEcbDailyReferenceXml,fetchEcbDailyFxReference,ECB_90_DAY_FX_URL,parseEcb90DayReferenceXml,fetchEcb90DayFxReference,lookupEcbHistoricalFx} from "../lib/global/ecb-daily-fx-reference.mjs";
import {evaluateFxConsensus} from "../lib/global/fx-consensus.mjs";
const nowIso="2026-11-07T08:00:00.000Z";
const xml=(date="2026-11-06",rows="<Cube currency='USD' rate='1.1165'/><Cube currency='JPY' rate='176.77'/><Cube currency='GBP' rate='0.83415'/>")=>
 `<?xml version="1.0" encoding="UTF-8"?><gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01">
 <gesmes:subject>Reference rates</gesmes:subject><gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
 <Cube><Cube time='${date}'>${rows}</Cube></Cube></gesmes:Envelope>`;
const fixture=xml();
const parsed=parseEcbDailyReferenceXml(fixture);
assert.equal(parsed.ok,true);
assert.equal(parsed.referenceDate,"2026-11-06");
assert.equal(parsed.rates.get("USD"),1.1165);
assert.equal(parsed.rates.get("JPY"),176.77);
assert.equal(parseEcbDailyReferenceXml(xml("2026-02-30")).reason,"ECB_INVALID_REFERENCE_XML");
assert.equal(parseEcbDailyReferenceXml(xml("2026-11-06","<Cube currency='USD' rate='-1'/>")).reason,"ECB_INVALID_REFERENCE_XML");
assert.equal(parseEcbDailyReferenceXml(xml("2026-11-06","<Cube currency='USD' rate='1'/><Cube currency='USD' rate='2'/>")).reason,"ECB_INVALID_REFERENCE_XML");
assert.equal(parseEcbDailyReferenceXml(xml("2026-11-06","<Cube currency='JPY' rate='NaN'/>")).reason,"ECB_INVALID_REFERENCE_XML");
assert.equal(parseEcbDailyReferenceXml(fixture.replace("European Central Bank","Some other bank")).reason,"ECB_INVALID_REFERENCE_XML");
assert.equal(parseEcbDailyReferenceXml(fixture.replace("<Cube><Cube","<!DOCTYPE x [<!ENTITY e 'bad'>]><Cube><Cube")).reason,"ECB_INVALID_REFERENCE_XML");
assert.equal(parseEcbDailyReferenceXml(fixture.replace("<Cube time='2026-11-06'>","<Cube time='2026-11-06'><Cube time='2026-11-06'>")).reason,"ECB_INVALID_REFERENCE_XML");
let calls=0;
const makeFetch=(body=fixture,opts={})=>async (url,req)=>{
 calls++;assert.equal(url,ECB_DAILY_FX_URL);
 assert.equal(req.method,"GET");assert.equal(req.redirect,"error");assert.equal(req.signal.aborted,false);
 return {ok:opts.ok??true,status:opts.status??200,headers:{get:()=>opts.contentType??"text/xml"},
  text:async()=>body};
};
const run=(baseCurrency,body=fixture,opts={})=>fetchEcbDailyFxReference({
 baseCurrency,nowIso,fetchImpl:makeFetch(body,opts)});
const jpy=await run("JPY");
assert.equal(jpy.ok,true);
assert.equal(jpy.reference.baseCurrency,"JPY");
assert.ok(Math.abs(jpy.reference.referenceRateToEur-1/176.77)<1e-14);
assert.equal(jpy.reference.euroBaseRate,176.77);
assert.equal(jpy.reference.referenceDate,"2026-11-06");
assert.equal(jpy.reference.ageCalendarDays,1);
assert.equal(jpy.reference.eligibleForExecution,false);
assert.equal(jpy.reference.countsTowardRealPaper,false);
assert.equal(jpy.reference.verificationStatus,"RESEARCH_ONLY_OFFICIAL_DAILY_REFERENCE");
for(const unsafeName of ["rate","family","base","quote","observedAt"])
 assert.equal(Object.hasOwn(jpy.reference,unsafeName),false,"Never promote ECB reference to executable FX evidence");
assert.equal(jpy.countsTowardRealPaper,false);
assert.equal((await run("USD")).reference.euroBaseRate,1.1165);
assert.equal((await run("GBP")).reference.euroBaseRate,.83415);
assert.equal((await run("HKD")).reason,"ECB_CURRENCY_NOT_PUBLISHED");
assert.equal((await run("USD",xml("2026-11-01"))).reason,"ECB_STALE_DAILY_REFERENCE");
assert.equal((await run("USD",xml("2026-11-01"))).reference.eligibleForExecution,false);
assert.equal((await run("USD",xml("2026-11-08"))).reason,"ECB_FUTURE_REFERENCE_DATE");
assert.equal((await run("USD",fixture,{status:429,ok:false})).reason,"ECB_RATE_LIMITED");
assert.equal((await run("USD",fixture,{status:503,ok:false})).reason,"ECB_HTTP_ERROR");
assert.equal((await run("USD",fixture,{contentType:"text/html"})).reason,"ECB_UNEXPECTED_CONTENT_TYPE");
assert.equal((await fetchEcbDailyFxReference({baseCurrency:"USD",nowIso,fetchImpl:async()=>{throw Error("outage")}})).reason,"ECB_NETWORK_FAILURE");
assert.equal((await fetchEcbDailyFxReference({baseCurrency:"EUR",nowIso,fetchImpl:makeFetch()})).reason,"ECB_EUR_IDENTITY_NOT_A_SOURCE");
assert.equal((await fetchEcbDailyFxReference({baseCurrency:"USD",nowIso,timeoutMs:0})).reason,"ECB_REFERENCE_POLICY_INVALID");
assert.equal((await fetchEcbDailyFxReference({baseCurrency:"USD",nowIso:"invalid"})).reason,"ECB_REFERENCE_POLICY_INVALID");
// Nothing from this adapter should satisfy executable FX quorum.
const notExecutable=evaluateFxConsensus({base:"JPY",nowIso,observations:[jpy.reference,jpy.reference]});
assert.equal(notExecutable.allowed,false);
assert.equal(notExecutable.reason,"FX_INDEPENDENT_SOURCES_MISSING");
const ninety=fixture.replace("<Cube><Cube time='2026-11-06'>","<Cube><Cube time='2026-11-06'>").replace("</Cube></Cube></gesmes:Envelope>","</Cube><Cube time='2026-11-05'><Cube currency='USD' rate='1.2'/><Cube currency='JPY' rate='180'/><Cube currency='GBP' rate='0.85'/></Cube></Cube></gesmes:Envelope>");
const history=parseEcb90DayReferenceXml(ninety);
assert.equal(history.ok,true);
assert.equal(history.days.length,2);
assert.equal(history.days[0].date,"2026-11-05");
assert.equal(parseEcb90DayReferenceXml(ninety.replace("time='2026-11-05'","time='2026-11-06'")).ok,false);
assert.equal(parseEcb90DayReferenceXml(ninety.replace("rate='180'","rate='-180'")).ok,false);
const historical=await fetchEcb90DayFxReference({nowIso,fetchImpl:async(url,req)=>{
 assert.equal(url,ECB_90_DAY_FX_URL);assert.equal(req.method,"GET");
 return {ok:true,status:200,headers:{get:()=>"text/xml"},text:async()=>ninety};
}});
assert.equal(historical.ok,true);
const fx=lookupEcbHistoricalFx({series:historical,currency:"JPY",at:"2026-11-06T08:00:00Z"});
assert.equal(fx.ok,true);assert.equal(fx.referenceDate,"2026-11-05");
assert.equal(fx.rateToEur,1/180);assert.equal(fx.eligibleForExecution,false);
assert.equal(lookupEcbHistoricalFx({series:historical,currency:"JPY",at:"2026-11-05T08:00:00Z"}).ok,false);
assert.equal(lookupEcbHistoricalFx({series:historical,currency:"USD",at:"2026-11-07T08:00:00Z"}).referenceDate,"2026-11-06");
assert.equal(lookupEcbHistoricalFx({series:historical,currency:"INR",at:"2026-11-07T08:00:00Z"}).ok,false);
assert.equal(lookupEcbHistoricalFx({series:historical,currency:"EUR",at:"2026-11-06T08:00:00Z"}).rateToEur,1);
assert.equal((await fetchEcb90DayFxReference({nowIso,fetchImpl:async()=>({ok:false,status:429})})).reason,"ECB_HISTORICAL_RATE_LIMITED");
console.log("Fenice ONE GLOBAL official ECB daily FX research-only contracts: PASS");
