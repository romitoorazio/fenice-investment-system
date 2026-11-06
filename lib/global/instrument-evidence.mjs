/** PAPER-only quote consensus: fail closed on symbol mismatch and provider disagreement. */
import { evaluateVenueEligibility, getVenue } from "./venue-registry.mjs";

export function evaluateInstrumentEvidence({mic,instrumentId,session,quotes,nowIso,maxMidDeviationBps=100}) {
  if(typeof instrumentId!=="string" || !instrumentId.trim())return {allowed:false,reason:"INSTRUMENT_ID_REQUIRED"};
  if(!Array.isArray(quotes) || quotes.length<2)return {allowed:false,reason:"QUOTES_MISSING"};
  // Do not silently discard a mismatched instrument: fail the entire evidence bundle.
  if(quotes.some(q=>q?.instrumentId!==instrumentId))return {allowed:false,reason:"INSTRUMENT_MISMATCH"};
  if(!Number.isFinite(maxMidDeviationBps)||maxMidDeviationBps<0||maxMidDeviationBps>10000)return {allowed:false,reason:"INVALID_DEVIATION_POLICY"};
  const base=evaluateVenueEligibility({mic,session,quotes,nowIso});
  if(!base.allowed)return base;
  const now=Date.parse(nowIso);
  const valid=quotes.filter(q=>q?.mic===mic && q.currency===getVenue(mic)?.currency && Number.isFinite(q.bid) && Number.isFinite(q.ask) && q.bid>0 && q.ask>=q.bid && Number.isFinite(Date.parse(q.observedAt)) && Date.parse(q.observedAt)<=now && now-Date.parse(q.observedAt)<=120000);
  // Only compare independently sourced quotes; duplicates from one family cannot establish consensus.
  const byFamily=new Map();
  for(const q of valid)if(typeof q.family==="string" && !byFamily.has(q.family))byFamily.set(q.family,(q.bid+q.ask)/2);
  if(byFamily.size<2)return {allowed:false,reason:"INDEPENDENT_QUOTES_MISSING"};
  const mids=[...byFamily.values()],minimum=Math.min(...mids),maximum=Math.max(...mids);
  const deviationBps=(maximum-minimum)/minimum*10000;
  if(!Number.isFinite(deviationBps)||deviationBps>maxMidDeviationBps)return {allowed:false,reason:"PROVIDER_PRICE_DISAGREEMENT",deviationBps};
  return {allowed:true,reason:null,venue:mic,instrumentId,independentFamilies:byFamily.size,deviationBps};
}
