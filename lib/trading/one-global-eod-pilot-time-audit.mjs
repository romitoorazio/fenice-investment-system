/**
 * FENICE ONE GLOBAL — independent, calendar-conservative EOD signal time audit.
 * Public metadata only; does not attest market sessions, source rights, price,
 * live trading, or a private PAPER fill. Never retroactively edits a ledger.
 */
import {oneGlobalNextReviewedMilanSession2026} from '../market/one-global-eu-delayed-eod.mjs';
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
/**
 * An ordinary-session *planning* deadline, not exchange-calendar evidence.
 * The earliest candidate EOD settlement cut-off is 48h after the next
 * regular weekday's closing auction. Never silently roll a missed Friday
 * CLOSE forward to Monday or treat the deadline as proof of a session.
 */
export function oneGlobalRegularNextSessionCutoff({mic,referenceSessionDate}){
  const venue=VENUE_WINDOWS[mic];
  if(!venue||!day(referenceSessionDate))return null;
  const targetSessionDate=mic==='XMIL'&&referenceSessionDate.startsWith('2026-')
    ?oneGlobalNextReviewedMilanSession2026(referenceSessionDate):nextWeekday(referenceSessionDate);
  if(!targetSessionDate)return null;
  const [h,m]=venue.close.split(":").map(Number);
  const [yr,mo,da]=targetSessionDate.split("-").map(Number);
  const wallUtc=Date.UTC(yr,mo-1,da,h,m);
  // Obtain the timezone offset at the daytime closing auction. This handles
  // both CET/CEST and Sydney DST without hardcoding a UTC-offset calendar.
  const wallHere=local(wallUtc,venue.zone);
  const localMs=Date.parse(wallHere.day+"T"+wallHere.clock+":00.000Z");
  const utc=wallUtc-(localMs-wallUtc);
  const confirmed=local(utc,venue.zone);
  if(confirmed.day!==targetSessionDate||confirmed.clock!==venue.close)
    reject("SESSION_CLOSE_TIMEZONE_AMBIGUOUS");
  const nextSessionRegularCloseAt=new Date(utc).toISOString();
  return {
    mic,referenceSessionDate,targetSessionDate,
    nextSessionRegularCloseAt,
    evidenceDeadlineAt:new Date(utc+48*3600_000).toISOString(),
    independentExchangeCalendarVerified:false,
    marketCloseReceiptVerified:false,
    brokerConnectivityAllowed:false,liveTradingAllowed:false,
  };
}
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
 const firstNextDay=mic==='XMIL'&&referenceSessionDate.startsWith('2026-')
   ?oneGlobalNextReviewedMilanSession2026(referenceSessionDate):nextWeekday(referenceSessionDate);
 if(!firstNextDay)status='REFERENCE_EXCHANGE_SESSION_NOT_VERIFIED';
 else if(ref.day!==referenceSessionDate||!(refClose<published&&published<=record))
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
