import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseBamiOfficialReferencePage as parse,fetchBamiOfficialReference,
 BAMI_OFFICIAL_PAGE,compareBamiOfficialReferenceToYahoo as compare} from "../lib/market/one-global-bami-official-reference.mjs";
const at="2026-11-13T12:00:00.000Z";
const page=(date="12/11/26",price="14,67",isin="IT0005218380",ticker="BAMI")=>
  `<!DOCTYPE html><html><body><h1>Banco Bpm</h1>
  <div>Fase: Inaccessible Ultimo Contratto: ${date} 17.36.25</div>
  <section><h2>Listino Ufficiale</h2><table>
    <tr><td>Denominazione</td><td>BANCO BPM</td></tr>
    <tr><td>Codice Isin</td><td>${isin}</td></tr>
    <tr><td>Codice Alfanumerico</td><td>${ticker}</td></tr>
    <tr><td>Prezzo Ufficiale</td><td>14,674319</td></tr>
    <tr><td>Prezzo di Riferimento di Chiusura</td><td>${price}</td></tr>
    <tr><td>Prezzo di Asta di Chiusura</td><td>${price}</td></tr>
  </table></section></body></html>`;
const good=parse({html:page(),observedAt:at});
assert.equal(good.public.status,"OFFICIAL_REFERENCE_VISIBLE_UNVERIFIED");
assert.equal(good.public.referenceSessionDate,"2026-11-12");
assert.equal(good.public.exactIsinAndTickerOnOfficialPage,true);
assert.equal(good.privateClose,14.67);
assert.equal(good.public.rightsReviewedForPaper,false);
assert.equal(good.public.pieceOfPaperEligible,undefined);
assert.equal(good.public.paperEligible,false);
assert.equal(good.public.liveTradingAllowed,false);
assert(!JSON.stringify(good.public).includes("14,67"));
assert(!JSON.stringify(good.public).includes("14.67"));
assert.match(good.public.sourceHtmlSha256,/^[a-f0-9]{64}$/);
for(const [label,input] of [
 ["issuer mismatch",page("12/11/26","14,67","IT0005218380","ENEL")],
 ["isin mismatch",page("12/11/26","14,67","IT0001111111","BAMI")],
]){
 const v=parse({html:input,observedAt:at});
 assert.equal(v.public.status,"OFFICIAL_BAMI_ISIN_AND_TICKER_NOT_MATCHED",label);
 assert.equal(v.privateClose,null);
}
assert.equal(parse({html:page("13/11/26"),observedAt:at}).public.status,
 "OFFICIAL_SAME_DAY_CLOSE_NOT_PUBLISHED_YET");
assert.equal(parse({html:page("11/11/26"),observedAt:at}).public.referenceSessionDate,
 "2026-11-11");
assert.equal(parse({html:page("01/11/26"),observedAt:at}).public.status,
 "OFFICIAL_SESSION_NOT_CURRENT");
assert.equal(parse({html:page("12/11/26","0,00"),observedAt:at}).public.status,
 "OFFICIAL_CLOSE_OR_DATE_INVALID");
assert.equal(parse({html:"<html>Invalid</html>",observedAt:at}).public.status,
 "OFFICIAL_HTML_MISSING_OR_OVERSIZE");
assert.throws(()=>parse({html:page(),observedAt:"wrong"}),/INVALID_OBSERVATION_TIME/);
assert.equal(BAMI_OFFICIAL_PAGE.startsWith("https://www.borsaitaliana.it/"),true);
const fake=await fetchBamiOfficialReference({nowIso:at,httpFetch:async()=>({
 ok:true,headers:{get:k=>k==="content-type"?"text/html":"0"},text:async()=>page(),
})});
assert.equal(fake.public.status,"OFFICIAL_REFERENCE_VISIBLE_UNVERIFIED");
assert.equal(fake.privateClose,14.67);
const blocked=await fetchBamiOfficialReference({nowIso:at,httpFetch:async()=>{throw Error("blocked")}});
assert.equal(blocked.public.status,"OFFICIAL_PAGE_NETWORK_UNAVAILABLE");
assert.equal(blocked.privateClose,null);
const compared=compare(good,[{date:"2026-11-12",close:14.66}]);
assert.equal(compared.status,"TWO_PUBLISHERS_CONCORDANT_RESEARCH_ONLY");
assert.equal(compared.independentPriceReceiptsAdmitted,0);
assert.equal(compared.marketDataRightsCertified,false);
assert.equal(compared.officialCloseCertifiedForPaper,false);
assert(!JSON.stringify(compared).includes("14.66"));
assert(!JSON.stringify(compared).includes("14.67"));
assert.equal(compare(good,[{date:"2026-11-11",close:14.66}]).status,
 "REFERENCE_SESSION_OR_YAHOO_BAR_MISSING");
assert.equal(compare(good,[{date:"2026-11-12",close:12.6}]).status,
 "PRICE_DIVERGENCE_DIAGNOSTIC_ONLY");
assert.equal(compare(blocked,[{date:"2026-11-12",close:14.66}]).status,
 "OFFICIAL_REFERENCE_NOT_READY");
const runner=readFileSync("scripts/run-world-v7-eod-research.mjs","utf8");
assert.match(runner,/fetchBamiOfficialReference/);
assert.match(runner,/bamiOfficialCloseCrosscheck/);
const comparer=readFileSync("lib/market/one-global-bami-official-reference.mjs","utf8");
assert.match(comparer,/last\.date!==source\.referenceSessionDate/, "session matching must remain inside the official/Yahoo comparator");
const workflow=readFileSync(".github/workflows/world-v7-eod-research.yml","utf8");
assert.match(workflow,/test-one-global-bami-official-reference\.mjs/);
console.log("PASS BAMI official source: exact identity, date, read-only bounded fetch, no raw public price, fail closed.");
