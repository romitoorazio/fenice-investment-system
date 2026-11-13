/**
 * Borsa Italiana OFFICIAL reference-close *read-only diagnostic*.
 * Public HTML page, GET only, no auth, browser automation, or WAF bypass.
 * Source-page HTML and price stay in transient process memory; callers may
 * publish only .public metadata. This is never a licensed PAPER receipt.
 */
import {createHash} from "node:crypto";
export const BAMI_OFFICIAL_PAGE=
  "https://www.borsaitaliana.it/borsa/azioni/listino-ufficiale.html?isin=IT0005218380&lang=it";
const hash=data=>createHash("sha256").update(data).digest("hex");
function localDay(iso){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Rome",
  day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",
  hourCycle:"h23"}).formatToParts(new Date(iso));
 const get=k=>parts.find(x=>x.type===k)?.value;
 return {date:get("year")+"-"+get("month")+"-"+get("day"),hour:Number(get("hour")),
   minute:Number(get("minute"))};
}
function cleanseHTML(html){
 return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]+>/g," ")
  .replace(/&(?:nbsp|#160|#xA0);/gi," ")
  .replace(/&amp;/gi,"&").replace(/&#0*39;|&apos;/gi,"'")
  .replace(/\|/g," ").replace(/\s+/g," ").trim();
}
const euroDecimal=s=>{
 if(typeof s!=="string"||!/^(?:\d{1,6})(?:,\d{1,6})?$/.test(s))return null;
 const n=Number(s.replace(",","."));
 return Number.isFinite(n)&&n>0&&n<100000?n:null;
};
function blank(status,observedAt,more={}){
 return {public:{provider:"borsa-italiana",sourceFamily:"euronext",
  scope:"OFFICIAL_REFERENCE_PRICE_IDENTITY_DIAGNOSTIC_ONLY",
  mic:"XMIL",symbol:"BAMI",isin:"IT0005218380",currency:"EUR",
  observedAt,status,independentOfficialPriceReceiptApproved:false,
  rightsReviewedForPaper:false,paperEligible:false,
  priceRedistributed:false,liveTradingAllowed:false,
  ...more},privateClose:null};
}
/** Pure parser; no provider data included in public projection. */
export function parseBamiOfficialReferencePage({html,observedAt}){
 const at=Date.parse(observedAt);
 if(!Number.isFinite(at)||new Date(at).toISOString()!==observedAt)
  throw Error("BAMI_OFFICIAL_INVALID_OBSERVATION_TIME");
 if(typeof html!=="string"||html.length<200||html.length>2_000_000)
  return blank("OFFICIAL_HTML_MISSING_OR_OVERSIZE",observedAt);
 const text=cleanseHTML(html);
 if(!/Denominazione\s+BANCO\s+BPM\b/i.test(text)
  ||!/Codice\s+Isin\s+IT0005218380\b/i.test(text)
  ||!/Codice\s+Alfanumerico\s+BAMI\b/i.test(text))
  return blank("OFFICIAL_BAMI_ISIN_AND_TICKER_NOT_MATCHED",observedAt);
 const close=text.match(/Prezzo\s+di\s+Riferimento\s+di\s+Chiusura\s+([0-9][0-9.,]{0,18})/i);
 const last=text.match(/Ultimo\s+Contratto\s*:?\s*(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2})[.:](\d{2})[.:](\d{2})/i);
 if(!close||!last)return blank("OFFICIAL_CLOSE_OR_SESSION_DATE_MISSING",observedAt);
 const price=euroDecimal(close[1]),year=last[3].length===2?"20"+last[3]:last[3];
 const date=year+"-"+last[2]+"-"+last[1];
 if(!price||!Number.isFinite(Date.parse(date+"T00:00:00Z"))
  ||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date
  ||Number(last[4])>23||Number(last[5])>59||Number(last[6])>59)
  return blank("OFFICIAL_CLOSE_OR_DATE_INVALID",observedAt);
 const observed=localDay(observedAt);
 const ageDays=(Date.parse(observed.date+"T00:00:00Z")-Date.parse(date+"T00:00:00Z"))/86400000;
 if(ageDays<0||ageDays>7)return blank("OFFICIAL_SESSION_NOT_CURRENT",observedAt,
  {referenceSessionDate:date});
 if(date===observed.date&&(observed.hour<17||
  (observed.hour===17&&observed.minute<45)))
  return blank("OFFICIAL_SAME_DAY_CLOSE_NOT_PUBLISHED_YET",observedAt,
    {referenceSessionDate:date});
 // Last-trade time anchors the exchange local session date but does not
 // independently authenticate the closing reference calculation or data terms.
 return {public:{...blank("OFFICIAL_REFERENCE_VISIBLE_UNVERIFIED",observedAt).public,
   referenceSessionDate:date,sourceHtmlSha256:hash(html),
   exactIsinAndTickerOnOfficialPage:true,closingFieldPresent:true,
   lastContractLocalClock:last[4]+":"+last[5]+":"+last[6]},
   privateClose:price};
}
/** Network fetch must never return HTML/price in stdout or GitHub files. */
export async function fetchBamiOfficialReference({nowIso=new Date().toISOString(),httpFetch=fetch}={}){
 try{
  const response=await httpFetch(BAMI_OFFICIAL_PAGE,{method:"GET",
   redirect:"error",headers:{Accept:"text/html"},
   signal:AbortSignal.timeout(9000)});
  if(!response.ok||!String(response.headers.get("content-type")||"").toLowerCase().includes("html"))
   return blank("OFFICIAL_PAGE_HTTP_OR_CONTENT_TYPE_UNAVAILABLE",nowIso);
  const length=Number(response.headers.get("content-length")||0);
  if(length>2_000_000)return blank("OFFICIAL_HTML_MISSING_OR_OVERSIZE",nowIso);
  return parseBamiOfficialReferencePage({html:await response.text(),observedAt:nowIso});
 }catch{return blank("OFFICIAL_PAGE_NETWORK_UNAVAILABLE",nowIso);}
}
