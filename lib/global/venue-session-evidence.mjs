/** Verified exchange calendar observations. No guessed trading hours or holidays. */
import {getVenue} from "./venue-registry.mjs";
export function evaluateVenueCalendarEvidence({mic,observation,nowIso,maxAgeMs=120000}){
  const venue=getVenue(mic),now=Date.parse(nowIso);
  if(!venue)return {allowed:false,reason:"UNKNOWN_VENUE"};
  if(!Number.isFinite(now)||!Number.isFinite(maxAgeMs)||maxAgeMs<0)return {allowed:false,reason:"INVALID_POLICY_OR_CLOCK"};
  if(observation?.mic!==mic||observation?.zone!==venue.zone||(typeof observation?.sourceId!=="string"||observation.sourceId.trim().length===0)||observation?.authoritative!==true)return {allowed:false,reason:"CALENDAR_NOT_AUTHORITATIVE"};
  const at=Date.parse(observation.observedAt??"");
  if(!Number.isFinite(at)||at>now||now-at>maxAgeMs)return {allowed:false,reason:"CALENDAR_STALE"};
  if(observation?.tradingDay!==true||observation?.phase!=="CONTINUOUS")return {allowed:false,reason:"MARKET_NOT_CONTINUOUS"};
  const opens=Date.parse(observation.opensAt??""),closes=Date.parse(observation.closesAt??"");
  if(!Number.isFinite(opens)||!Number.isFinite(closes)||opens>=closes||now<opens||closes-now<300000)return {allowed:false,reason:"OUTSIDE_VERIFIED_SESSION"};
  return {allowed:true,reason:null,session:{mic,state:"OPEN",authoritative:true,observedAt:observation.observedAt,closesAt:observation.closesAt},sourceId:observation.sourceId};
}
