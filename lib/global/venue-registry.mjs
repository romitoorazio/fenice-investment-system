/** Fenice ONE GLOBAL: read-only venue metadata, never an exchange-open assertion. */
export const VENUES = Object.freeze([
  {mic:"XTKS",name:"Tokyo Stock Exchange",zone:"Asia/Tokyo",currency:"JPY"},
  {mic:"XHKG",name:"Hong Kong Exchanges",zone:"Asia/Hong_Kong",currency:"HKD"},
  {mic:"XSHG",name:"Shanghai Stock Exchange",zone:"Asia/Shanghai",currency:"CNY"},
  {mic:"XNSE",name:"National Stock Exchange of India",zone:"Asia/Kolkata",currency:"INR"},
  {mic:"XMIL",name:"Borsa Italiana",zone:"Europe/Rome",currency:"EUR"},
  {mic:"XETR",name:"Xetra",zone:"Europe/Berlin",currency:"EUR"},
  {mic:"XLON",name:"London Stock Exchange",zone:"Europe/London",currency:"GBP"},
  {mic:"XNYS",name:"New York Stock Exchange",zone:"America/New_York",currency:"USD"},
  {mic:"XNAS",name:"Nasdaq",zone:"America/New_York",currency:"USD"},
]);
const byMic=new Map(VENUES.map(v=>[v.mic,v]));
export function getVenue(mic){return byMic.get(mic)??null;}
export function validateVenueRegistry(){
  if(new Set(VENUES.map(v=>v.mic)).size!==VENUES.length)throw Error("DUPLICATE_MIC");
  for(const v of VENUES){
    if(!/^[A-Z0-9]{4}$/.test(v.mic)||!/^[A-Z]{3}$/.test(v.currency))throw Error("INVALID_VENUE");
    try{new Intl.DateTimeFormat("en",{timeZone:v.zone}).format(new Date());}
    catch{throw Error("INVALID_TIMEZONE_"+v.mic);}
  }
  return true;
}
/** A registry entry alone never proves open hours or data access. */
export function evaluateVenueEligibility({mic,session,quotes,nowIso,requiredIndependentFamilies=2}){
  const venue=getVenue(mic),now=Date.parse(nowIso);
  if(!venue)return {allowed:false,reason:"UNKNOWN_VENUE"};
  if(!Number.isFinite(now))return {allowed:false,reason:"INVALID_CLOCK"};
  if(!Number.isSafeInteger(requiredIndependentFamilies)||requiredIndependentFamilies<2)return {allowed:false,reason:"INVALID_INDEPENDENT_QUORUM_POLICY"};
  if(session?.mic!==mic||session?.authoritative!==true||session?.state!=="OPEN")return {allowed:false,reason:"SESSION_NOT_VERIFIED_OPEN"};
  const at=Date.parse(session.observedAt??""),end=Date.parse(session.closesAt??"");
  if(!Number.isFinite(at)||at>now||now-at>120000||!Number.isFinite(end)||end-now<300000)return {allowed:false,reason:"SESSION_STALE_OR_CLOSING"};
  if(!Array.isArray(quotes))return {allowed:false,reason:"QUOTES_MISSING"};
  const families=new Set();
  for(const q of quotes){
    if(q?.mic!==mic||q.currency!==venue.currency||typeof q.family!=="string"||!q.family.trim())continue;
    const t=Date.parse(q.observedAt??"");
    if(!Number.isFinite(t)||t>now||now-t>120000||!Number.isFinite(q.bid)||!Number.isFinite(q.ask)||q.bid<=0||q.ask<q.bid)continue;
    families.add(q.family.trim().toLowerCase());
  }
  if(families.size<requiredIndependentFamilies)return {allowed:false,reason:"INDEPENDENT_FRESH_QUOTES_MISSING",families:families.size};
  return {allowed:true,reason:null,venue:mic,families:families.size};
}
