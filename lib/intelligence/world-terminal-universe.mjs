/** Exact-listing worldwide Yahoo research intake, never executable quotes.
 * Yahoo ticker mapping is only a proposed historical-data lookup. A symbol
 * match and matching currency still do not certify MIC, exchange sessions,
 * license rights or any PAPER/broker eligibility.
 */
const US=new Set(["XNAS","XNYS","ARCX"]);
export const WORLD_YAHOO_RESEARCH_SYMBOLS=Object.freeze({
  "XMIL:ENEL":{query:"ENEL.MI",currency:"EUR"},
  "XETR:SIE":{query:"SIE.DE",currency:"EUR"},
  "XPAR:MC":{query:"MC.PA",currency:"EUR"},
  "XTKS:7203":{query:"7203.T",currency:"JPY"},
  "XSHG:600519":{query:"600519.SS",currency:"CNY"},
  "XNSE:RELIANCE":{query:"RELIANCE.NS",currency:"INR"},
  "BVMF:PETR4":{query:"PETR4.SA",currency:"BRL"},
  "XHKG:0700":{query:"0700.HK",currency:"HKD"},
  "XASX:CBA":{query:"CBA.AX",currency:"AUD"},
  "XSWX:NESN":{query:"NESN.SW",currency:"CHF"},
  "XJSE:NPN":{query:"NPN.JO",currency:"ZAR",providerCurrency:"ZAc",priceScaleToListing:0.01},
});
const keys=Object.keys(WORLD_YAHOO_RESEARCH_SYMBOLS);
const matched=x=>x?.status==="active"&&x.assetClass==="equity"
  &&/^[A-Z0-9]{4}$/.test(x.exchangeMic||"")
  &&/^[A-Z0-9][A-Z0-9._-]{0,23}$/.test(x.ticker||"")
  &&/^[A-Z]{3}$/.test(x.currency||"");
export function worldResearchTerminalDefinitions(master,seeds){
  if(!Array.isArray(master?.instruments)||!Array.isArray(seeds?.instruments))
    throw Error("WORLD_TERMINAL_CATALOGUE_MISSING");
  const rows=[...master.instruments,...seeds.instruments].filter(matched);
  const keysSeen=new Set(),tickersSeen=new Set(),output=[];
  for(const item of rows){
    if(US.has(item.exchangeMic))continue;
    const key=item.exchangeMic+":"+item.ticker;
    if(keysSeen.has(key)||tickersSeen.has(item.ticker))
      throw Error("WORLD_TERMINAL_DUPLICATE_EXACT_LISTING");
    keysSeen.add(key);tickersSeen.add(item.ticker);
    const map=WORLD_YAHOO_RESEARCH_SYMBOLS[key];
    // Unknown/mismatched listings must not be silently renamed or blended
    // with another issuer's price series. Leave them in the coverage audit.
    if(!map||map.currency!==item.currency)continue;
    output.push([
      item.ticker,map.query,item.name,"Azioni",item.exchangeMic,
      {exchangeMic:item.exchangeMic,currency:item.currency,providerTicker:map.query,
       providerCurrency:map.providerCurrency??item.currency,
       priceScaleToListing:map.priceScaleToListing??1,
       researchOnly:true,paperExecutionAllowed:false,brokerSubmissionAllowed:false,
       exactMicExecutionVerified:false},
    ]);
  }
  // Track catalog additions without assuming every provider symbol resolves.
  if(output.length>keys.length)throw Error("WORLD_TERMINAL_CATALOGUE_OVERFLOW");
  return output.sort((a,b)=>a[4].localeCompare(b[4])||a[0].localeCompare(b[0]));
}
export function verifiesWorldYahooResearchMeta(meta,definition){
  const marker=definition?.[5];
  if(marker?.researchOnly!==true)return true;
  return meta&&typeof meta==="object"
    &&meta.symbol===marker.providerTicker
    &&meta.currency===marker.providerCurrency
    &&Number.isFinite(marker.priceScaleToListing)
    &&[1,0.01].includes(marker.priceScaleToListing)
    &&(marker.priceScaleToListing===1
      ?marker.providerCurrency===marker.currency
      :marker.providerCurrency==="ZAc"&&marker.currency==="ZAR"
        &&marker.exchangeMic==="XJSE"&&marker.providerTicker==="NPN.JO")
    &&meta.regularMarketPrice!==0
    &&marker.paperExecutionAllowed===false
    &&marker.brokerSubmissionAllowed===false
    &&marker.exactMicExecutionVerified===false;
}

// Use for research OHLC only, never for a broker or PAPER fill.
// Yahoo's NPN.JO chart unit ZAc is 1/100 of the listing currency ZAR.
export function normalizeWorldYahooResearchPrice(value,definition){
  const raw=Number(value);
  if(!Number.isFinite(raw)||raw<=0)return NaN;
  const marker=definition?.[5];
  const scale=marker?.researchOnly===true?marker.priceScaleToListing:1;
  if(!Number.isFinite(scale)||![1,0.01].includes(scale))return NaN;
  return raw*scale;
}
