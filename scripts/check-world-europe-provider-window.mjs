/**
 * Read-only European exchange-opening diagnostic schedule guard.
 * Verifies cron delivery near 09:37 Europe/Rome across CET/CEST.
 * This proves scheduling only, never exchange state, quote rights or PAPER.
 */
import {appendFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const ALLOWED_CRONS=new Set(["37 7 * * 1-5","37 8 * * 1-5"]);
const MAX_DELAY_MINUTES=30;
const romeParts=date=>Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
  timeZone:"Europe/Rome",hour:"2-digit",minute:"2-digit",
  hourCycle:"h23",weekday:"short",
}).formatToParts(date).map(p=>[p.type,p.value]));

export function assessEuropeProviderObservationWindow({eventName,schedule,nowIso}={}){
  const now=typeof nowIso==="string"?Date.parse(nowIso):NaN;
  if(!Number.isFinite(now)||new Date(now).toISOString()!==nowIso)
    return {allowed:false,status:"INVALID_CLOCK",delayMinutes:null};
  if(eventName!=="schedule"||!ALLOWED_CRONS.has(schedule))
    return {allowed:false,status:"UNTRUSTED_TRIGGER",delayMinutes:null};
  const hour=Number(schedule.split(" ")[1]);
  const date=new Date(now);
  const due=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),hour,37);
  const rome=romeParts(new Date(due));
  const localCorrect=rome.hour==="09"&&rome.minute==="37"
    &&!["Sat","Sun"].includes(rome.weekday);
  const delayMinutes=Number(((now-due)/60000).toFixed(2));
  const allowed=localCorrect&&delayMinutes>=0&&delayMinutes<=MAX_DELAY_MINUTES;
  return {allowed,status:allowed?"DIAGNOSTIC_WINDOW_VALID":
    !localCorrect?"WRONG_CET_CEST_OR_WEEKEND":"MISSED_DIAGNOSTIC_WINDOW",
    delayMinutes,scheduledAt:new Date(due).toISOString(),
    romeLocalSchedule:rome.weekday+" "+rome.hour+":"+rome.minute,
    maxDelayMinutes:MAX_DELAY_MINUTES,
    authoritativeExchangeProof:false,sourceRightsCertified:false,
    paperAuthorizationGranted:false,liveTradingAllowed:false};
}
if(process.argv[1]&&new URL("file://"+process.argv[1]).href===import.meta.url){
  const result=assessEuropeProviderObservationWindow({
    eventName:process.env.GITHUB_EVENT_NAME,
    schedule:process.env.FENICE_SCHEDULE_CRON,
    nowIso:new Date().toISOString(),
  });
  if(process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT,"allowed="+result.allowed+"\n");
  console.log("EUROPE_PROVIDER_DIAGNOSTIC_WINDOW "+JSON.stringify(result));
  // A missed cron is a published scheduling diagnostic, not a quote proof.
}
