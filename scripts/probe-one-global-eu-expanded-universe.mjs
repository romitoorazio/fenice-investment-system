/**
 * FENICE — strictly read-only venue-coverage research, not PAPER admission.
 *
 * Identities confirmed against official Euronext Milan equity pages:
 * UCG  https://live.euronext.com/en/product/equities/IT0005239360-MTAA
 * ENI  https://live.euronext.com/en/product/equities/IT0003132476-MTAA
 * ISP  https://live.euronext.com/en/product/equities/IT0000072618-MTAA
 * TRN  https://live.euronext.com/it/markets/milan/equities/euronext/list?page=1
 *
 * No private Blob, tokens, owner rights, journal, simulated fills or broker.
 * No quote value, cash, hash, document, API endpoint or raw vendor body logs.
 */
import {
  fetchOneGlobalEuronextMilanFile,
  fetchOneGlobalCboeCeuxFile,
  parseOneGlobalEuronextMilan,
  parseOneGlobalCboeCeux,
  isOneGlobalMilanRegularSessionDate2026
} from '../lib/market/one-global-eu-delayed-eod.mjs';

const candidates=Object.freeze([
  {symbol:'UCG',isin:'IT0005239360'},
  {symbol:'ENI',isin:'IT0003132476'},
  {symbol:'ISP',isin:'IT0000072618'},
  {symbol:'TRN',isin:'IT0003242622'}
]);
const now=new Date();
const dateParts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'
}).formatToParts(now).map(part=>[part.type,part.value]));
const sessionDate=[dateParts.year,dateParts.month,dateParts.day].join('-');
const policy={kind:'FENICE_EU_CANDIDATE_RESEARCH_ONLY',sessionDate,
  mode:'PUBLIC_SOURCE_READ_ONLY',candidateCount:candidates.length,
  paperFillsCreated:0,signalsCreated:0,certifiedTrades:0,
  technicalMappingApproved:false,ownerSourceRightsVerified:false,
  brokerConnectivityAllowed:false,liveTradingAllowed:false};
const safeCodes=new Set([
  'EU_DELAYED_EOD_CBOE_EXACT_PRECLOSE_TRADE_MISSING',
  'EU_DELAYED_EOD_EURONEXT_SESSION_INCOMPLETE',
  'EU_DELAYED_EOD_EURONEXT_ROW_SHAPE_INVALID',
  'EU_DELAYED_EOD_EURONEXT_AUCTION_PRICE_AMBIGUOUS',
  'EU_DELAYED_EOD_CBOE_ROW_SHAPE_INVALID',
  'EU_DELAYED_EOD_EURONEXT_PROVENANCE_INVALID',
]);
const classify=error=>{
  const message=typeof error?.message==='string'?error.message:'';
  return safeCodes.has(message)?message:'EXACT_VENUE_DATA_NOT_PROVEN';
};
if(!isOneGlobalMilanRegularSessionDate2026(sessionDate)){
  console.log('FENICE_EU_EXPANSION='+JSON.stringify({...policy,status:'NOT_A_REVIEWED_MILAN_SESSION',candidates:[]}));
}else{
  let euronext,cboe;
  try{[euronext,cboe]=await Promise.all([
    fetchOneGlobalEuronextMilanFile(),
    fetchOneGlobalCboeCeuxFile({sessionDate})
  ]);}
  catch{
    console.log('FENICE_EU_EXPANSION='+JSON.stringify({...policy,status:'SOURCE_PAIR_UNAVAILABLE',candidates:[]}));
    process.exitCode=2;
  }
  if(euronext&&cboe){
    const results=[];
    for(const instrument of candidates){
      const entry={symbol:instrument.symbol,primaryValid:false,secondaryValid:false,
        closeCoherent:false,researchUptrend:false,eligibleForPaper:false};
      let primary,secondary;
      try{primary=parseOneGlobalEuronextMilan({
        raw:euronext.raw,isin:instrument.isin,sessionDate});
        entry.primaryValid=true;}
      catch(error){entry.primaryFailure=classify(error);}
      try{secondary=parseOneGlobalCboeCeux({
        raw:cboe.raw,isin:instrument.isin,sessionDate});
        entry.secondaryValid=true;}
      catch(error){entry.secondaryFailure=classify(error);}
      if(primary&&secondary){
        const diff=100*Math.abs(primary.close-secondary.close)/((primary.close+secondary.close)/2);
        entry.closeCoherent=diff<=0.5;
        entry.researchUptrend=entry.closeCoherent
          &&primary.close>primary.open
          &&primary.close>=primary.vwap*1.001
          &&primary.continuousLast>=primary.vwap;
      }
      results.push(entry);
    }
    console.log('FENICE_EU_EXPANSION='+JSON.stringify({...policy,
      status:'OFFICIAL_SOURCE_RESEARCH_COMPLETED',
      verifiedVenuePairs:results.filter(x=>x.primaryValid&&x.secondaryValid).length,
      coherentVenuePairs:results.filter(x=>x.closeCoherent).length,
      researchUptrends:results.filter(x=>x.researchUptrend).length,
      candidates:results}));
  }
}
