/**
 * FENICE ONE GLOBAL — independent, calendar-conservative EOD signal time audit.
 * Public metadata only; does not attest market sessions, source rights, price,
 * live trading, or a private PAPER fill. Never retroactively edits a ledger.
 */
const VENUE_WINDOWS=Object.freeze({
  XMIL:{zone:"Europe/Rome",open:"09:00",close:"17:40"},
  XASX:{zone:"Australia/Sydney",open:"09:59",close:"16:11"},
});
const reject=(code)=>{throw Error("EOD_PILOT_TIMING_"+code);};
const iso=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)
 &&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const day=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)
 &&Number.isFinite(Date.parse(x+"T00:00:00Z"))
 &&new Date(x+"T00:00:00Z").toISOString().startsWith(x);
function local(instant,zone){
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
   timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",
   hour:"2-digit",minute:"2-digit",hourCycle:"h23"
 }).formatToParts(new Date(instant)).map(x=>[x.type,x.value]));
 return {day:p.year+"-"+p.month+"-"+p.day,clock:p.hour+":"+p.minute};
}
const nextWeekday=date=>{
 const d=new Date(date+"T12:00:00Z");
 do{d.setUTCDate(d.getUTCDate()+1);}while([0,6].includes(d.getUTCDay()));
 return d.toISOString().slice(0,10);
};
export function auditOneGlobalEodPilotSignalWindow({mic,referenceSessionDate,
 referenceCloseAt,referencePublishedAt,recordedAt}){
 const venue=VENUE_WINDOWS[mic];
 if(!venue)return {status:"VENUE_CALENDAR_NOT_IMPLEMENTED",eligibleBySchedule:false,
   independentSessionProof:false,paperFillEligible:false};
 if(!day(referenceSessionDate)||![referenceCloseAt,referencePublishedAt,recordedAt].every(iso))
   reject("INVALID_INPUT");
 const ref=local(referenceCloseAt,venue.zone),recorded=local(recordedAt,venue.zone);
 const refClose=Date.parse(referenceCloseAt),published=Date.parse(referencePublishedAt),record=Date.parse(recordedAt);
 let status="PROVISIONAL_PROSPECTIVE_WINDOW_OK";
 const firstNextDay=nextWeekday(referenceSessionDate);
 if(ref.day!==referenceSessionDate||!(refClose<published&&published<=record))
   status="REFERENCE_DATE_OR_PUBLICATION_INVALID";
 else if(recorded.day<referenceSessionDate)
   status="DECISION_BEFORE_REFERENCE_SESSION";
 else if(recorded.day===referenceSessionDate){
   if(recorded.clock<venue.close)status="DECISION_BEFORE_REFERENCE_SESSION_END";
 }else if(recorded.day>firstNextDay
   ||(recorded.day===firstNextDay&&recorded.clock>=venue.open)){
   status="DECISION_AFTER_NEXT_NORMAL_SESSION_OPEN_OR_UNVERIFIED_HOLIDAY";
 }
 // An exchange holiday/late opening must be certified separately. A normal
 // weekday calculation is a conservative flag, never real exchange calendar proof.
 return {mic,referenceSessionDate,
  recordedExchangeLocalDate:recorded.day,
  recordedExchangeLocalClock:recorded.clock,
  firstNextNormalWeekday:firstNextDay,
  regularOpenLocal:venue.open,regularEndLocal:venue.close,
  status,eligibleBySchedule:status==="PROVISIONAL_PROSPECTIVE_WINDOW_OK",
  independentSessionProof:false,sourceRightsCertified:false,
  independentCloseReceipts:0,paperFillEligible:false,
  brokerConnectivityAllowed:false,liveTradingAllowed:false,
  phase9Credit:0};
}
