/**
 * Bounded, read-only Milan opportunity screen from official Euronext MTAA and
 * Cboe CEUX observations. It is NOT the ONE GLOBAL PAPER universe, authority,
 * consent, source licensing, or a recommendation to buy.
 *
 * Raw upstream bytes remain in the ephemeral runner and never enter the
 * report, public Git data, an execution receipt, or the original PAPER ledger.
 */
import {
  ONE_GLOBAL_MILAN_INSTRUMENTS,extractOneGlobalEuronextCsv,
  parseOneGlobalEuronextMilan,parseOneGlobalCboeCeux,oneGlobalMilanSession,
  isOneGlobalMilanRegularSessionDate2026,
} from './one-global-eu-delayed-eod.mjs';

const extra=Object.freeze([
  Object.freeze({symbol:'UCG',isin:'IT0005239360'}),
  Object.freeze({symbol:'ENI',isin:'IT0003132476'}),
  Object.freeze({symbol:'ISP',isin:'IT0000072618'}),
  Object.freeze({symbol:'TRN',isin:'IT0003242622'}),
]);
// The PAPER writer's existing two-ticker allowlist remains untouched.
export const ONE_GLOBAL_MILAN_RESEARCH_CANDIDATES=Object.freeze([
  ...Object.values(ONE_GLOBAL_MILAN_INSTRUMENTS).map(x=>Object.freeze({symbol:x.symbol,isin:x.isin})),
  ...extra,
]);
const fail=reason=>{throw Error('EU_RESEARCH_SCREEN_'+reason);};
const iso=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)
  &&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;

/**
 * Partition verified ZIP contents in one pass. The existing strict per-ISIN
 * parser is still responsible for venue, auction, trade time and volume.
 * This avoids inflating a ~63 MB official CSV separately for each ticker.
 */
function boundedPerIsinCsv(raw){
  const bytes=extractOneGlobalEuronextCsv(raw); // full ZIP CRC and bomb guard
  const value=bytes.toString('utf8');
  if(!Buffer.from(value).equals(bytes))fail('EURONEXT_UTF8_INVALID');
  const first=value.indexOf('\n'),second=value.indexOf('\n',first+1);
  if(first<0||second<0)fail('EURONEXT_HEADER_MISSING');
  const header=value.slice(0,second+1),rows=new Map();
  for(const candidate of ONE_GLOBAL_MILAN_RESEARCH_CANDIDATES)rows.set(candidate.symbol,[]);
  let cursor=second+1;
  while(cursor<value.length){
    const next=value.indexOf('\n',cursor),end=next<0?value.length:next;
    const line=value.slice(cursor,end);
    cursor=end+1;
    // The strict parser later verifies the exact ISIN in field 2; filtering
    // is solely a performance optimization, never an identity admission.
    for(const candidate of ONE_GLOBAL_MILAN_RESEARCH_CANDIDATES){
      if(line.includes(candidate.isin))rows.get(candidate.symbol).push(line);
    }
  }
  return new Map([...rows].map(([symbol,lines])=>[symbol,Buffer.from(header+lines.join('\n')+'\n','utf8')]));
}

export function screenOneGlobalMilanResearchPair({euronextRaw,cboeRaw,sessionDate,observedAt}={}){
  if(!isOneGlobalMilanRegularSessionDate2026(sessionDate)||!iso(observedAt)
    ||Date.parse(observedAt)<Date.parse(oneGlobalMilanSession(sessionDate).sessionClosedAt)
    ||!Buffer.isBuffer(euronextRaw)||!Buffer.isBuffer(cboeRaw)
    ||cboeRaw.length<20||cboeRaw.length>4_000_000)fail('INPUT_INVALID');
  const perIsin=boundedPerIsinCsv(euronextRaw);
  const candidates=[];
  let validPairs=0,agreedPairs=0,researchUptrends=0,sourceIncomplete=0,divergentPairs=0;
  for(const {symbol,isin} of ONE_GLOBAL_MILAN_RESEARCH_CANDIDATES){
    let primary,secondary;
    try{
      primary=parseOneGlobalEuronextMilan({raw:perIsin.get(symbol),isin,sessionDate});
      secondary=parseOneGlobalCboeCeux({raw:cboeRaw,isin,sessionDate});
    }catch{
      sourceIncomplete++;
      candidates.push({symbol,mic:'XMIL',status:'SOURCE_PAIR_INCOMPLETE',
        independentVenuePairVerified:false,closeAgreementVerified:false,
        researchUptrendVerified:false,eligibleForPaper:false,sourceRightsVerified:false});
      continue;
    }
    validPairs++;
    const differencePct=Math.abs(primary.close-secondary.close)/((primary.close+secondary.close)/2)*100;
    const agreed=differencePct<=0.5;
    const uptrend=primary.close>primary.open&&primary.close>=primary.vwap*1.001
      &&primary.continuousLast>=primary.vwap;
    if(agreed)agreedPairs++;else divergentPairs++;
    if(agreed&&uptrend)researchUptrends++;
    candidates.push({symbol,mic:'XMIL',
      status:!agreed?'VENUE_CLOSE_DIVERGENCE':uptrend?'UPTREND_RESEARCH_ONLY':'NO_UPTREND',
      independentVenuePairVerified:true,closeAgreementVerified:agreed,
      researchUptrendVerified:agreed&&uptrend,
      eligibleForPaper:false,sourceRightsVerified:false});
  }
  return {
    mode:'ONE_GLOBAL_MILAN_SIX_CANDIDATE_RESEARCH_ONLY',sessionDate,observedAt,
    candidateCount:candidates.length,validPairs,agreedPairs,researchUptrends,
    sourceIncomplete,divergentPairs,candidates,
    sourceFamilies:['euronext-mtaa-primary','cboe-ceux-orderbook'],
    originalPrivateJournalRead:false,originalPrivateJournalChanged:false,
    originalMarketDataRightsReviewed:false,createsSignals:0,paperFillsCreated:0,
    phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false,
    paperExecutionAllowed:false,rawPricesPublished:false,
  };
}
