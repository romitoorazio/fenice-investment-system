import {createHash} from "node:crypto";

const isoDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error("INVALID_SOURCE_DATE");
  const parsed = new Date(value+"T00:00:00.000Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10)!==value) throw Error("INVALID_SOURCE_DATE");
  return value;
};
const digest = (...items) => createHash("sha256").update(items.join("|")).digest("hex");
const tidy = value => String(value??"").trim().replace(/[\r\n\t]/g," ").slice(0,240);

export function parseNasdaqTradingAddsWithDiagnostics(raw) {
  if (typeof raw!=="string" || raw.length>1_500_000) throw Error("NASDAQ_SOURCE_INVALID_SIZE");
  const rows=raw.trim().split(/\r?\n/);
  const required=["Symbol","Company Name","NASDAQ Action","BX Action","PSX Action","Effective Date","Primary Listing Market"];
  if (rows[0]?.replace(/^\uFEFF/,"").trim()!==required.join("|")) throw Error("NASDAQ_SOURCE_HEADER_MISMATCH");
  const trailer=rows.at(-1)?.trim()||"";
  const match=/^File Creation Time:\s*(\d{8}\d{2}:\d{2})\|*$/.exec(trailer);
  if (!match) throw Error("NASDAQ_SOURCE_CREATION_TIME_MISSING");
  const fileTime=match[1]; // Source publishes local clock text, not a verified UTC timestamp.
  const events=[], seen=new Set();
  let unsupportedAddRows=0;
  for (const line of rows.slice(1,-1)) {
    if (!line.trim()) continue;
    const columns=line.split("|");
    if (columns.length!==7) throw Error("NASDAQ_SOURCE_ROW_MALFORMED");
    const [symbolRaw,nameRaw,action]=columns;
    if (action!=="Add") continue; // Deletes and other exchange-only actions are not IPO evidence.
    const symbol=tidy(symbolRaw).toUpperCase(),name=tidy(nameRaw);
    // Official exchange notices can contain symbols outside the supported
    // research identity alphabet. Quarantine only those rows; never invent
    // a sanitized ticker, IPO, PAPER signal or broker instrument.
    if (!/^[A-Z0-9.^-]{1,14}$/.test(symbol)||!name) {
      unsupportedAddRows+=1;
      continue;
    }
    const dateMatch=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(columns[5]);
    if (!dateMatch) throw Error("NASDAQ_SOURCE_EFFECTIVE_DATE_INVALID");
    const effectiveDate=isoDate(dateMatch[3]+"-"+dateMatch[1].padStart(2,"0")+"-"+dateMatch[2].padStart(2,"0"));
    const market=tidy(columns[6]);
    if (!/^[A-Z]$/.test(market)) throw Error("NASDAQ_SOURCE_VENUE_INVALID");
    const id=digest("NASDAQ_TRADER_ADD",symbol,effectiveDate,market);
    if (seen.has(id)) continue;
    seen.add(id);
    events.push({
      id,kind:"EXCHANGE_ADD_NOTICE",source:"NASDAQ_TRADER",symbol,name,effectiveDate,
      venueCode:market,sourceFileCreationLocal:fileTime,
      sourceUrl:"https://www.nasdaqtrader.com/dynamic/SymDir/TradingSystemAddsDeletes.txt",
      classification:"LISTING_ADD_NOT_IPO_OR_FIRST_TRADE_PROOF",
      ipoOfferPrice:null,firstTradeAt:null,sourceTimeUtc:null
    });
  }
  return {events:events.sort((a,b)=>a.id.localeCompare(b.id)),unsupportedAddRows};
}

// Preserve the original parser contract for existing research-only callers.
export function parseNasdaqTradingAdds(raw) {
  return parseNasdaqTradingAddsWithDiagnostics(raw).events;
}

export function parseSecEdgarMaster(raw) {
  if (typeof raw!=="string"||raw.length>12_000_000) throw Error("SEC_SOURCE_INVALID_SIZE");
  const rows=raw.split(/\r?\n/);
  const start=rows.findIndex(line=>line.trim()==="CIK|Company Name|Form Type|Date Filed|Filename");
  if (start===-1) throw Error("SEC_SOURCE_HEADER_MISMATCH");
  const events=[],seen=new Set();
  for (const line of rows.slice(start+1)) {
    if (!line.trim()||/^-+$/.test(line.trim())) continue;
    const cols=line.split("|");
    if (cols.length!==5) throw Error("SEC_SOURCE_ROW_MALFORMED");
    const [cikRaw,nameRaw,formRaw,dateRaw,filenameRaw]=cols.map(s=>s.trim());
    if (!["S-1","S-1/A","F-1","F-1/A"].includes(formRaw)) continue;
    const cik=Number(cikRaw),name=tidy(nameRaw),date=isoDate(dateRaw);
    const filename=filenameRaw.replace(/^\/+/,"");
    if (!Number.isSafeInteger(cik)||cik<1||!name||
        !/^edgar\/data\/\d+\/[\w.-]+\.txt$/i.test(filename)) throw Error("SEC_SOURCE_IDENTITY_INVALID");
    const id=digest("SEC_EDGAR",String(cik),formRaw,date,filename);
    if (seen.has(id)) continue;seen.add(id);
    events.push({
      id,kind:"REGISTRATION_FILING",source:"SEC_EDGAR",symbol:null,name,cik,form:formRaw,filedDate:date,
      sourceUrl:"https://www.sec.gov/Archives/"+filename,
      classification:"REGISTRATION_NOT_IPO_APPROVAL_OR_LISTING_PROOF",
      ipoOfferPrice:null,firstTradeAt:null,sourceTimeUtc:null
    });
  }
  return events.sort((a,b)=>a.id.localeCompare(b.id));
}

export function makeOfficialListingResearch({nasdaqEvents,secEvents=[],instrumentMaster,globalUniverse,generatedAt,sourceStatus}) {
  if (!Number.isFinite(Date.parse(generatedAt))||new Date(generatedAt).toISOString()!==generatedAt)
    throw Error("DISCOVERY_OBSERVATION_TIME_INVALID");
  if (!Array.isArray(instrumentMaster?.instruments)||!Array.isArray(globalUniverse?.instruments))
    throw Error("DISCOVERY_UNIVERSE_INVALID");
  const known=new Set([...instrumentMaster.instruments,...globalUniverse.instruments]
    .flatMap(x=>[x?.ticker,x?.symbol].filter(Boolean).map(s=>String(s).trim().toUpperCase())));
  const events=[...nasdaqEvents,...secEvents].map(e=>({
    ...e, inCurrentSeedUniverse:e.symbol?known.has(e.symbol):null,
    discoveryOnly:true,paperAllowed:false,liveAllowed:false,brokerOrderAllowed:false
  })).sort((a,b)=>a.id.localeCompare(b.id));
  if (new Set(events.map(e=>e.id)).size!==events.length) throw Error("DISCOVERY_EVENT_COLLISION");
  return {
    version:1,generatedAt,status:"OFFICIAL_LISTING_RESEARCH_ONLY",
    safety:{noTrading:true,noPaperAdmission:true,noBrokerWrites:true,noIpoOrFirstTradeInference:true},
    sourceStatus,summary:{sourceEvents:events.length,
      newSymbolsOutsideSeed:events.filter(e=>e.symbol&&!e.inCurrentSeedUniverse).length,
      registrationFilingsWithoutVerifiedSymbol:events.filter(e=>e.source==="SEC_EDGAR").length},
    events:events.slice(0,300), truncated:events.length>300
  };
}


/**
 * The SEC daily index is NOT a reliable IPO feed if the returned 200 body is
 * an HTML access/interstitial page. Never turn that response into a zero-row
 * registration day. No source data or User-Agent is emitted to public logs.
 */
export function requireSecMasterTransport({body,contentType}={}){
  if(typeof body!=='string'||body.length===0||body.length>12_000_000)
    throw Error('SEC_SOURCE_INVALID_SIZE');
  const start=body.slice(0,2048).replace(/^\uFEFF/,'').trimStart();
  if(/^(?:<!doctype\s+html\b|<html(?:\s|>)|<\?xml\b)/i.test(start)
    ||/<html(?:\s|>)/i.test(start))
    throw Error('SEC_SOURCE_HTML_RESPONSE_NOT_INDEX');
  if(typeof contentType!=='string'||contentType.length>300)
    throw Error('SEC_SOURCE_MEDIA_TYPE_INVALID');
  // Some official HTTP servers label plain index text generically. Accept
  // only if the strict EDGAR index parser subsequently confirms the header.
  if(/\btext\/html\b/i.test(contentType)
    &&!body.includes('CIK|Company Name|Form Type|Date Filed|Filename'))
    throw Error('SEC_SOURCE_HTML_RESPONSE_NOT_INDEX');
  return body;
}

/**
 * A single 'yesterday' index misses S-1 filings preceding a newly-listed
 * symbol. Research a bounded set of previous US weekdays; these are date
 * candidates, never exchange or filing-availability proofs.
 */
export function recentUsWeekdaysBefore(now,limit=5){
  const d=new Date(now);
  if(!Number.isFinite(d.getTime())||!Number.isSafeInteger(limit)||limit<1||limit>5)
    throw Error('SEC_SOURCE_LOOKBACK_INPUT_INVALID');
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(d).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const day=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day)));
  const dates=[];
  for(let attempts=0;dates.length<limit&&attempts<10;attempts++){
    day.setUTCDate(day.getUTCDate()-1);
    if(![0,6].includes(day.getUTCDay()))dates.push(day.toISOString().slice(0,10));
  }
  if(dates.length!==limit)throw Error('SEC_SOURCE_LOOKBACK_INCOMPLETE');
  return dates;
}
