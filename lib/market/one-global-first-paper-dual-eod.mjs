/**
 * FENICE ONE GLOBAL — zero-cost dual-vendor EOD research intake for US demo tickers.
 * NOT a fill or a licence attestation. The original provider payload hashes stay private.
 */
import {createHash} from 'node:crypto';
const fail=reason=>{throw Error('FIRST_PAPER_EOD_'+reason);};
const TICKERS=Object.freeze({AAPL:'XNAS',MSFT:'XNAS',TSLA:'XNAS'});
const sha=x=>createHash('sha256').update(x).digest('hex');
const iso=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString()===x;
const day=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().startsWith(x);
const price=x=>typeof x==='string'&&/^\d+(?:\.\d+)?$/.test(x)?Number(x):x;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
function local(nowIso){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(nowIso)).map(x=>[x.type,x.value]));
 return {date:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour),minute:Number(p.minute)};
}
function parseRaw(raw){
 if(!Buffer.isBuffer(raw)||raw.length<10||raw.length>2_000_000)fail('RAW_SOURCE_BYTES_REQUIRED');
 try{return JSON.parse(raw.toString('utf8'));}catch{fail('SOURCE_JSON_INVALID');}
}
export function buildFirstPaperFreeEodEvidence({alphaRaw,eodhdRaw,symbol,sessionDate,observedAt}){
 if(!Object.hasOwn(TICKERS,symbol)||!day(sessionDate)||!iso(observedAt))fail('IDENTITY_OR_TIME_INVALID');
 const when=local(observedAt),candidateDate=Date.parse(sessionDate+'T00:00:00Z');
 if(when.date<sessionDate||Date.parse(observedAt)-candidateDate>4*86400_000)fail('STALE_OR_FUTURE_SESSION');
 if([0,6].includes(new Date(candidateDate).getUTCDay()))fail('WEEKEND_SESSION');
 if(when.date===sessionDate&&(when.hour<16||(when.hour===16&&when.minute<20)))fail('EXCHANGE_NOT_CLOSED');
 const a=parseRaw(alphaRaw),e=parseRaw(eodhdRaw);
 if(a['Error Message']||a.Note||a.Information||e?.error||e?.message)fail('PROVIDER_ERROR_OR_LIMIT');
 if(a?.['Meta Data']?.['2. Symbol']!==symbol||typeof a?.['Time Series (Daily)']!=='object')fail('ALPHA_SYMBOL_OR_SCHEMA_MISMATCH');
 const bars=a['Time Series (Daily)'];
 const b=bars[sessionDate];
 if(!b||!positive(price(b['4. close'])))fail('ALPHA_COMPLETED_CLOSE_MISSING');
 const p1=price(b['4. close']);
 if(!Array.isArray(e)||e.length===0||e.length>366)fail('EODHD_SCHEMA_INVALID');
 const dates=new Set();
 for(const r of e){if(!day(r?.date)||dates.has(r.date)||!positive(price(r.close)))fail('EODHD_ROWS_INVALID');dates.add(r.date);}
 const matches=e.filter(x=>x.date===sessionDate);
 if(matches.length!==1)fail('EODHD_COMPLETED_CLOSE_MISSING');
 const p2=price(matches[0].close);
 const mean=(p1+p2)/2;
 const diffPct=Math.abs(p1-p2)/mean*100;
 if(diffPct>0.5)fail('INDEPENDENT_QUOTES_DIVERGE');
 const alphaHistory=Object.entries(bars).filter(([d,v])=>day(d)&&d<=sessionDate&&positive(price(v?.['4. close']))).sort(([a],[b])=>b.localeCompare(a));
 let indicator='INSUFFICIENT_HISTORY',sma5=null,sma20=null,prevSma5=null;
 if(alphaHistory.length>=21){
   const values=alphaHistory.map(([,r])=>price(r['4. close']));
   const avg=(a,n)=>a.slice(0,n).reduce((v,x)=>v+x,0)/n;
   sma5=avg(values,5);sma20=avg(values,20);prevSma5=avg(values.slice(1),5);
   indicator=sma5>sma20*1.005&&sma5>=prevSma5?'UPTREND_RESEARCH_ONLY':'NO_UPTREND';
 }
 return {
   mode:'ONE_GLOBAL_FIRST_PAPER_DUAL_EOD_RESEARCH_ONLY',observedAt,sessionDate,
   key:TICKERS[symbol]+':'+symbol,mic:TICKERS[symbol],currency:'USD',symbol,
   upstreamFamilyIdentitiesIndependentlyAudited:false,
   sources:[{providerId:'alpha-vantage',sourceFamily:'alpha-vantage',payloadSha256:sha(alphaRaw),close:p1},
     {providerId:'eodhd',sourceFamily:'eodhd',payloadSha256:sha(eodhdRaw),close:p2}],
   closeDifferencePct:Math.round(diffPct*10000)/10000,
   researchIndicator:indicator,sma5,sma20,priorSma5:prevSma5,
   pendingRequirements:[
    'CONFIRM_EXACT_MIC_AND_EXCHANGE_SESSION_CALENDAR',
    'VERIFY_ORIGINAL_VENDOR_PAYLOAD_AUTHENTICITY_AND_INDEPENDENT_UPSTREAM',
    'OWNER_REVIEWED_PRIVATE_NON_DISPLAY_SIMULATION_RIGHTS_FOR_EACH_PROVIDER',
    'RECORD_PROSPECTIVE_SIGNAL_BEFORE_NEXT_MARKET_OPEN',
    'WAIT_FOR_A_DIFFERENT_LATER_COMPLETED_SESSION_AFTER_SIGNAL',
    'REQUIRE_PRIVATE_FENICE_ENGINE_SETTLEMENT_AND_LEDGER_REPLAY'
   ],
   paperSettlementEligible:false,certifiedVirtualFills:0,phase9Credit:0,
   brokerConnectivityAllowed:false,liveTradingAllowed:false,
   note:'Source comparison only. Demo/free endpoints do not themselves confer PAPER usage rights. No order or fill generated.'
 };
}
