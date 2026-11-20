/**
 * Bounded, read-only preflight for ONE GLOBAL's hourly Production CI backup.
 *
 * A trusted completed scheduled CI job can recover a missing GitHub EOD cron
 * only during EXISTING Milan/New York post-close research windows.
 * This is not exchange-session, owner, source, price, trade or PAPER proof.
 */
import {isOneGlobalMilanRegularSessionDate2026} from '../market/one-global-eu-delayed-eod.mjs';
import {privateEodNewYorkClock} from './one-global-private-eod-autopilot.mjs';

const existingUpstreams=new Set(['Fenice Production Deploy','Fenice World V7 EOD Research']);
// These jobs already run on separate published schedules. They are not new
// market-data providers or alternative owners of the original private journal.
const scheduledRecoveryUpstreams=new Set([
  'Fenice Production CI','Fenice Foundation',
  'Fenice ONE GLOBAL — Unified PAPER Evidence',
]);
function romeClock(nowIso){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',
    weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date(nowIso)).map(row=>[row.type,row.value]));
  return {date:[p.year,p.month,p.day].join('-'),minute:Number(p.hour)*60+Number(p.minute)};
}
export function assessOneGlobalHourlyCiRecovery({
  nowIso,workflowEvent,upstreamName='',upstreamEvent=''
}={}){
  if(typeof nowIso!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(nowIso)
    ||!Number.isFinite(Date.parse(nowIso))||new Date(nowIso).toISOString()!==nowIso)
    throw Error('ONE_GLOBAL_HOURLY_CI_CLOCK_INVALID');
  if(['schedule','workflow_dispatch'].includes(workflowEvent))
    return {shouldInvoke:true,reason:'ORIGINAL_TRUSTED_TRIGGER',isExchangeProof:false};
  if(workflowEvent!=='workflow_run')
    return {shouldInvoke:false,reason:'UNEXPECTED_EVENT_REJECTED',isExchangeProof:false};
  if(existingUpstreams.has(upstreamName))
    return {shouldInvoke:true,reason:'PREEXISTING_TRUSTED_FALLBACK',isExchangeProof:false};
  if(!scheduledRecoveryUpstreams.has(upstreamName)||upstreamEvent!=='schedule')
    return {shouldInvoke:false,reason:'UNTRUSTED_CI_TRIGGER_REJECTED',isExchangeProof:false};
  const eu=romeClock(nowIso),ny=privateEodNewYorkClock(nowIso);
  const euAllowed=isOneGlobalMilanRegularSessionDate2026(eu.date)
    &&eu.minute>=18*60&&eu.minute<=21*60;
  const usAllowed=!['Sat','Sun'].includes(ny.weekday)
    &&ny.minute>=16*60+35&&ny.minute<=18*60+55;
  return {shouldInvoke:euAllowed||usAllowed,
    reason:euAllowed?'EU_POSTCLOSE_RECOVERY_WINDOW':usAllowed?'US_POSTCLOSE_RECOVERY_WINDOW'
      :'OUTSIDE_EXISTING_POSTCLOSE_WINDOWS',isExchangeProof:false};
}
