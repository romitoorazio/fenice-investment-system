/** Official ECB 90-day XML for the existing currencies. Never an executable FX quote. */
import {createHash} from 'node:crypto';
import {readOneGlobalBoundedSource} from './one-global-cloud-settlement-sources.mjs';
const fail=code=>{throw Error('CLOUD_SETTLEMENT_FX_'+code);};
const CURRENCIES=new Set(['AUD','USD','GBP','CHF','JPY','HKD','SGD','ZAR']);
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const day=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)
  &&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
export function selectOneGlobalEcbCurrencyReference({raw,currency,sessionDate,observedAt}={}){
  if(!Buffer.isBuffer(raw)||raw.length<120||raw.length>350000||!CURRENCIES.has(currency)
    ||!day(sessionDate)||!iso(observedAt))fail('IDENTITY_OR_RAW_SOURCE_INVALID');
  const xml=raw.toString('utf8');
  if(/<!DOCTYPE|<!ENTITY|<script/i.test(xml)||!xml.includes('European Central Bank')||!xml.includes('eurofxref'))fail('OFFICIAL_XML_INVALID');
  const blocks=[...xml.matchAll(/<Cube\s+time=(['"])(\d{4}-\d\d-\d\d)\1\s*>([\s\S]*?)<\/Cube>/g)];
  if(blocks.length<1||blocks.length>100)fail('DATE_ROWS_INVALID');
  const seen=new Set(),eligible=[];
  for(const row of blocks){
    const date=row[2];if(!day(date)||seen.has(date))fail('DUPLICATE_OR_INVALID_DATE');seen.add(date);
    const rates=[...row[3].matchAll(/<Cube\s+currency=(['"])([A-Z]{3})\1\s+rate=(['"])(\d+(?:\.\d+)?)\3\s*\/>/g)].filter(r=>r[2]===currency);
    if(rates.length>1)fail('DUPLICATE_CURRENCY');
    const distance=(Date.parse(sessionDate)-Date.parse(date))/86400000;
    // Strictly prior-session FX prevents same-day look-ahead in Asian markets.
    // The timestamp below is our actual fetch time, never an invented ECB release.
    if(rates.length===1&&distance>0&&distance<=7&&Date.parse(date+'T23:59:59Z')<Date.parse(observedAt)){
      const units=Number(rates[0][4]);if(!Number.isFinite(units)||units<=0||units>1e6)fail('RATE_INVALID');
      eligible.push({date,units});
    }
  }
  eligible.sort((a,b)=>a.date.localeCompare(b.date));const last=eligible.at(-1);
  if(!last)fail('PUBLISHED_PRIOR_SESSION_REFERENCE_MISSING');
  return {currency,unitsPerEuro:last.units,rateToEuro:1/last.units,
    source:'ECB_REFERENCE_ONLY',referenceDate:last.date,publishedAt:observedAt,
    series:'EXR.D.'+currency+'.EUR.SP00.A',referenceOnly:true,
    timestampMeaning:'FIRST_OBSERVED_AT_SOURCE_FETCH_NOT_OFFICIAL_RELEASE',
    ecbResponseSha256:createHash('sha256').update(raw).digest('hex')};
}
export async function fetchOneGlobalEcbCurrencyReference({currency,sessionDate,
  fetcher=fetch,clock=()=>new Date().toISOString()}={}){
  if(currency==='EUR')return {evidence:null,raw:null};
  if(!CURRENCIES.has(currency))fail('CURRENCY_NOT_SUPPORTED');
  const raw=await readOneGlobalBoundedSource(new URL('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml'),
    {fetcher,accept:'application/xml',maxBytes:350000});
  return {raw,evidence:selectOneGlobalEcbCurrencyReference({raw,currency,sessionDate,observedAt:clock()})};
}
