/** Read-only quote ingestion boundary. A network response is not independent market evidence. */
import {getVenue} from "./venue-registry.mjs";
export async function fetchProviderQuote({mic,instrumentId,endpoint,provider,family,fetchImpl=globalThis.fetch,nowIso=new Date().toISOString(),timeoutMs=8000}){
  const fail=reason=>({ok:false,reason});
  const venue=getVenue(mic),now=Date.parse(nowIso);
  if(!venue||typeof instrumentId!=="string"||!instrumentId.trim())return fail("INVALID_INSTRUMENT_OR_VENUE");
  let parsed;try{parsed=new URL(endpoint);}catch{return fail("INVALID_PROVIDER_CONFIGURATION");}
  if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.hash||!provider?.trim?.()||!family?.trim?.()||!Number.isFinite(now))return fail("INVALID_PROVIDER_CONFIGURATION");
  if(typeof fetchImpl!=="function"||!Number.isFinite(timeoutMs)||timeoutMs<100||timeoutMs>30000)return fail("INVALID_FETCH_POLICY");
  // Strip query parameters, including API keys, from persisted provenance.
  const publicSourceUrl=parsed.origin+parsed.pathname;
  let response;
  try{response=await fetchImpl(endpoint,{method:"GET",headers:{accept:"application/json"},signal:AbortSignal.timeout(timeoutMs),redirect:"error"});}catch{return fail("PROVIDER_NETWORK_FAILURE");}
  if(response?.status===429)return fail("PROVIDER_RATE_LIMITED");
  if(!response?.ok)return fail("PROVIDER_HTTP_ERROR");
  // A provider can return HTTP 200 with an API-level error or exhausted quota.
  const type=response.headers?.get?.("content-type");
  if(type&& !/^application\/(?:[a-z0-9.+-]*\+)?json\b/i.test(type))return fail("PROVIDER_UNEXPECTED_CONTENT_TYPE");
  let body;
  try{body=await response.json();}catch{return fail("PROVIDER_INVALID_JSON");}
  if(!body||typeof body!=="object"||Array.isArray(body))return fail("PROVIDER_INVALID_JSON");
  if(body.status==="error"||body.code===429||body.code==="429"||body.error)return fail(Number(body.code)===429?"PROVIDER_RATE_LIMITED":"PROVIDER_API_ERROR");
  // Require a normalized, explicitly MIC- and currency-qualified bid/ask payload.
  if(body?.mic!==mic||body?.instrumentId!==instrumentId||body?.currency!==venue.currency)return fail("PROVIDER_INSTRUMENT_MISMATCH");
  const bid=body.bid,ask=body.ask,observedAt=body.observedAt,at=Date.parse(observedAt??"");
  if(typeof bid!=="number"||typeof ask!=="number"||!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<bid)return fail("PROVIDER_INVALID_SPREAD");
  if(!Number.isFinite(at)||at>now||now-at>120000)return fail("PROVIDER_STALE_OR_FUTURE_QUOTE");
  return {ok:true,quote:{mic,instrumentId,currency:venue.currency,bid,ask,observedAt,family,sourceId:`${provider}:${instrumentId}:${observedAt}`,provider,sourceUrl:publicSourceUrl,synthetic:false,verificationStatus:"PROVIDER_RESPONSE_UNVERIFIED"},reason:null};
}
