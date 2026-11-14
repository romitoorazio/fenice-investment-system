/**
 * Local-only prospective PAPER SIGNAL scheduler policy.
 * Exchange-local clock is only a *window*, never an independently verified
 * exchange session, quote, licence, approval or virtual execution.
 */
import {replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';
export const PRIVATE_EOD_SYMBOLS=Object.freeze(['AAPL','MSFT','TSLA']);
const symbolSet=new Set(PRIVATE_EOD_SYMBOLS);
export function privateEodNewYorkClock(nowIso){
  if(typeof nowIso!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(nowIso)
    ||!Number.isFinite(Date.parse(nowIso))||new Date(nowIso).toISOString()!==nowIso)
    throw Error('EOD_AUTOPILOT_CLOCK_INVALID');
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',
    weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date(nowIso)).map(x=>[x.type,x.value]));
  return {sessionDate:p.year+'-'+p.month+'-'+p.day,weekday:p.weekday,
    minute:Number(p.hour)*60+Number(p.minute)};
}
export function planPrivateEodSignalCycle({nowIso,originalLedger,symbols=PRIVATE_EOD_SYMBOLS}={}){
  if(!Array.isArray(symbols)||symbols.length<1||symbols.length>3
    ||new Set(symbols).size!==symbols.length||symbols.some(x=>!symbolSet.has(x)))
    throw Error('EOD_AUTOPILOT_SYMBOL_UNIVERSE_INVALID');
  // Never trust a journal merely because it parses as JSON.
  const state=replayOneGlobalEodPaperLedger(originalLedger);
  const clock=privateEodNewYorkClock(nowIso);
  const weekday=!['Sat','Sun'].includes(clock.weekday);
  // US cash close 16:00 ET; allow vendor updates after 16:35, but not late-night
  // reuse of a previous close. Real calendar/halts remain unverified here.
  const window=weekday&&clock.minute>=16*60+35&&clock.minute<=18*60+55;
  const candidates=symbols.map(symbol=>{
    const key='XNAS:'+symbol;
    const signalId='fenice-xnas-'+symbol.toLowerCase()+'-'+clock.sessionDate.replaceAll('-','')+'-eod-research';
    const previouslyCommitted=originalLedger.events.some(e=>e?.kind==='SIGNAL'&&e?.signalId===signalId);
    const pending=state.pendingSignals.includes(key);
    return {symbol,key,eligible:window&&!pending&&!previouslyCommitted,
      reason:!window?'NOT_IN_NY_POSTCLOSE_WINDOW':pending?'SIGNAL_ALREADY_PENDING':
        previouslyCommitted?'SAME_DAY_SIGNAL_ALREADY_RECORDED':'ELIGIBLE_FOR_RESEARCH_PROBE'};
  });
  return {mode:'ONE_GLOBAL_PRIVATE_EOD_RESEARCH_SIGNAL_AUTOPILOT',
    sessionDate:clock.sessionDate,nyWeekday:clock.weekday,
    expectedPostcloseWindow:window,actualExchangeSessionProven:false,
    candidates,providerIndependenceCertified:false,sourceUsageRightsCertified:false,
    paperFillsCreated:0,certifiedTrades:0,phase9Credit:0,
    liveTradingAllowed:false,brokerConnectivityAllowed:false};
}
