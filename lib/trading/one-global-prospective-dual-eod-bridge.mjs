/**
 * Research-only bridge: immutable two-publisher EOD observation ->
 * prospective post-close SIGNAL in the ORIGINAL FENICE private EOD journal.
 *
 * NO PAPER FILL, no brokerage access, and no source-licensing attestation.
 * This is safe even with a free/demo API: only a research signal is recorded.
 */
import {createHash} from 'node:crypto';
import {recordOneGlobalEodSignal} from './one-global-eod-paper.mjs';

const reject=reason=>{throw Error('EOD_PROSPECTIVE_BRIDGE_'+reason);};
const sha256=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const iso=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const day=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const isHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const number=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const supported=Object.freeze({AAPL:'XNAS',MSFT:'XNAS',TSLA:'XNAS'});

function nyClock(when){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
   timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',
   hour:'2-digit',minute:'2-digit',hourCycle:'h23',
 }).formatToParts(new Date(when)).map(x=>[x.type,x.value]));
 return {day:parts.year+'-'+parts.month+'-'+parts.day,
   hour:Number(parts.hour),minute:Number(parts.minute)};
}
/** Derive 16:00 New York in UTC without assuming EDT/EST. */
function referenceCloseUtc(sessionDate){
 const [y,m,d]=sessionDate.split('-').map(Number);
 for(let hour=19;hour<=22;hour++){
   const s=new Date(Date.UTC(y,m-1,d,hour)).toISOString();
   const local=nyClock(s);
   if(local.day===sessionDate&&local.hour===16&&local.minute===0)return s;
 }
 reject('VENUE_TIMEZONE_CONVERSION');
}
export function buildOneGlobalProspectiveSignalFromDualEod({report,previousLedger,nowIso}){
 if(!iso(nowIso)||!report||typeof report!=='object'||Array.isArray(report)
   ||!iso(report.observedAt)||!day(report.sessionDate))reject('REPORT_OR_CLOCK_INVALID');
 const today=nyClock(nowIso);
 if(today.day!==report.sessionDate||Date.parse(report.observedAt)>Date.parse(nowIso)
   ||Date.parse(nowIso)-Date.parse(report.observedAt)>3*3600000
   ||today.hour<16||(today.hour===16&&today.minute<20)
   ||[0,6].includes(new Date(report.sessionDate+'T00:00:00Z').getUTCDay()))
   reject('NOT_SAME_DAY_POSTCLOSE_PROSPECTIVE');
 if(report.mode!=='ONE_GLOBAL_FIRST_PAPER_DUAL_EOD_RESEARCH_ONLY'
   ||!Object.hasOwn(supported,report.symbol)
   ||report.mic!==supported[report.symbol]
   ||report.key!==report.mic+':'+report.symbol
   ||report.currency!=='USD'
   ||report.researchIndicator!=='UPTREND_RESEARCH_ONLY'
   ||report.paperSettlementEligible!==false||report.certifiedVirtualFills!==0
   ||report.phase9Credit!==0||report.brokerConnectivityAllowed!==false
   ||report.liveTradingAllowed!==false
   ||report.upstreamFamilyIdentitiesIndependentlyAudited!==false
   ||!number(report.sma5)||!number(report.sma20)||!number(report.priorSma5)
   ||report.sma5<=report.sma20*1.005||report.sma5<report.priorSma5)
   reject('RESEARCH_GATE_NOT_MET');
 const providers=report.sources;
 if(!Array.isArray(providers)||providers.length!==2
   ||providers[0]?.providerId!=='alpha-vantage'||providers[0]?.sourceFamily!=='alpha-vantage'
   ||providers[1]?.providerId!=='eodhd'||providers[1]?.sourceFamily!=='eodhd'
   ||providers.some(p=>!isHash(p.payloadSha256)||!number(p.close)))
   reject('TWO_SOURCE_METADATA_INVALID');
 const mid=(providers[0].close+providers[1].close)/2;
 const deviation=Math.abs(providers[0].close-providers[1].close)/mid*100;
 if(deviation>0.5||!Number.isFinite(report.closeDifferencePct)
   ||Math.abs(report.closeDifferencePct-deviation)>0.00011)
   reject('SOURCE_DISAGREEMENT');
 const referenceCloseAt=referenceCloseUtc(report.sessionDate);
 if(Date.parse(report.observedAt)-Date.parse(referenceCloseAt)<20*60000
   ||Date.parse(referenceCloseAt)>=Date.parse(nowIso))
   reject('CLOSE_NOT_PROVEN_COMPLETE');
 const signal={
   signalId:'fenice-xnas-'+report.symbol.toLowerCase()+'-'+report.sessionDate.replaceAll('-','')+'-eod-research',
   key:report.key,mic:report.mic,side:'BUY',currency:'USD',
   decisionAt:nowIso,referenceSessionDate:report.sessionDate,
   referenceCloseAt,referencePublishedAt:report.observedAt,
   sourceSnapshotHash:sha256(report),maxNotionalEuro:50,
   strategyReason:'UPTREND_CONFIRMATION',
   researchSignalOnly:true,sourceRightsIndependentlyCertified:false,
 };
 // Strict original engine verifies chain, duplicate, clock and risk. No SETTLE.
 const recorded=recordOneGlobalEodSignal({previousLedger,nowIso,signal});
 return {
   ledger:recorded.ledger,signalHash:recorded.signalHash,
   key:signal.key,decisionAt:nowIso,referenceSessionDate:report.sessionDate,
   originalEodJournal:true,kind:'SIGNAL',paperFillCreated:false,
   phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false,
   independentlyVerifiedProviderRights:false,
 };
}
