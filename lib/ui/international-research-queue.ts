/** Research-only evidence queue for non-US issuers; no orders, quotes or profit estimates. */
import { GLOBAL_DESK_VENUES } from "./global-research-desk.ts";
type Item={id?:string;ticker?:string;name?:string;status?:string;assetClass?:string;region?:string;country?:string;exchangeMic?:string;currency?:string;lastVerifiedAt?:string|null;identifiers?:Array<{type?:string;value?:string;source?:string}>};
type Master={instruments?:Item[]};
type Fundamentals={companies?:Array<{ticker?:string;source?:string;observedAt?:string;filing?:{form?:string}}>} ;
type Terminal={assets?:Array<{symbol?:string;technical?:{observedAt?:string;source?:string;timestampSemantics?:string}}>};
type Committee={generatedAt?:string;allDecisions?:Array<{symbol?:string;decision?:string;committeeScore?:number}>};
type Country={code?:string;providerCovered?:boolean;instrumentCount?:number;instrumentTypes?:Record<string,number|undefined>};
type Ref={generatedAt?:string;countryCoverage?:Country[];safety?:{researchOnly?:boolean;paperExecutionAllowed?:boolean;liveTradingAllowed?:boolean;brokerConnectivityAllowed?:boolean;isolatedFromPaperV6InstrumentMaster?:boolean;changesPaperV6Fingerprint?:boolean}};
const venueRegion=new Map<string,string>(GLOBAL_DESK_VENUES.map(x=>[x.mic,x.regionId]));
function hours(raw:unknown,now:number):number|null{
 if(typeof raw!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw))return null;
 const ts=Date.parse(raw);if(!Number.isFinite(ts)||new Date(ts).toISOString()!==raw||ts>now)return null;
 return Math.round((now-ts)/360000)/10;
}
function only<T>(items:T[],fn:(x:T)=>boolean):T|null{const found=items.filter(fn);return found.length===1?found[0]:null}
export function buildInternationalResearchQueue(
 master:Master,fundamentals:Fundamentals,terminal:Terminal,committee:Committee,reference:Ref,now=Date.now()
){
 if(!Number.isSafeInteger(now)||now<0||now>8.64e15)throw Error("INVALID_RESEARCH_CLOCK");
 const catalogueAgeHours=hours(reference.generatedAt,now);
 const safetyValid=reference.safety?.researchOnly===true&&reference.safety?.paperExecutionAllowed===false
  &&reference.safety?.liveTradingAllowed===false&&reference.safety?.brokerConnectivityAllowed===false
  &&reference.safety?.isolatedFromPaperV6InstrumentMaster===true
  &&reference.safety?.changesPaperV6Fingerprint===false;
 const catalogueRecent=safetyValid&&catalogueAgeHours!==null&&catalogueAgeHours<=72;
 const committeeAge=hours(committee.generatedAt,now);
 const uniqueIds=new Set<string>();
 const rows=[];
 for(const row of master.instruments??[]){
  if(row.status!=="active"||row.assetClass!=="equity"
    ||!["europe","asia-pacific","latin-america-caribbean","middle-east-africa"].includes(row.region??""))continue;
  if(!row.id||uniqueIds.has(row.id)||!/^[A-Z0-9._-]{1,25}$/.test(row.ticker??""))continue;
  uniqueIds.add(row.id);
  const venue=venueRegion.get(row.exchangeMic??"")??null;
  const namedSecurity=venue!==null&&/^[A-Z]{2}$/.test(row.country??"")&&/^[A-Z]{3}$/.test(row.currency??"")
   &&row.identifiers?.some(i=>i.type==="ticker"&&i.value===row.ticker&&!!i.source)===true;
  const identityVerified=namedSecurity&&hours(row.lastVerifiedAt,now)!==null
   &&hours(row.lastVerifiedAt,now)!<=90*24;
  const filing=only(fundamentals.companies??[],x=>x.ticker===row.ticker);
  const issuerDocs=filing?.source==="SEC EDGAR Company Facts"
   &&["10-K","10-Q","20-F","40-F","6-K"].includes(filing.filing?.form??"")
   &&hours(filing.observedAt,now)!==null;
  const technical=only(terminal.assets??[],x=>x.symbol===row.ticker)?.technical;
  const candle=technical?.source?.startsWith("Yahoo Finance chart")===true
   &&technical.timestampSemantics==="DAILY_CANDLE_SESSION_BUCKET_NOT_LAST_TRADE"
   &&hours(technical.observedAt,now)!==null;
  const reviewed=only(committee.allDecisions??[],x=>x.symbol===row.ticker);
  const committeeEntry=committeeAge!==null&&committeeAge<=36
   &&reviewed!==null&&reviewed.decision!=="EVITA"&&typeof reviewed.committeeScore==="number"
   &&Number.isFinite(reviewed.committeeScore)&&reviewed.committeeScore>=0&&reviewed.committeeScore<=100;
  const country=only(reference.countryCoverage??[],x=>x.code===row.country);
  const countryCovered=safetyValid&&country?.providerCovered===true
   &&Number.isSafeInteger(country.instrumentCount)&&country.instrumentCount!>=0
   &&Number.isSafeInteger(country.instrumentTypes?.["Common Stock"]??0);
  const missing:string[]=[];
  if(!identityVerified)missing.push("VERIFY_TICKER_MIC_CURRENCY_AT_VENUE");
  if(!countryCovered)missing.push("COUNTRY_REFERENCE_UNVERIFIED");
  if(!catalogueRecent)missing.push("REFRESH_WORLD_REFERENCE_CATALOGUE");
  if(!issuerDocs)missing.push("ADD_PRIMARY_ISSUER_FILINGS");
  if(!candle)missing.push("ADD_DAILY_PRICE_HISTORY_WITH_PROVENANCE");
  if(!committeeEntry)missing.push("BUILD_INDEPENDENT_COMMITTEE_ASSESSMENT");
  missing.push("VERIFY_BID_ASK_LIQUIDITY");
  missing.push("VERIFY_FX_FEES_VENUE_CALENDAR");
  missing.push("SEPARATE_PAPER_APPROVAL_REQUIRED");
  rows.push({
   id:row.id,symbol:row.ticker!,name:row.name??row.ticker!,issuerCountry:row.country??null,
   issuerRegion:row.region??null,venueMic:namedSecurity?row.exchangeMic??null:null,
   tradingRegion:venue,currency:row.currency??null,
   listingType:venue!==null&&venue!==row.region?"FOREIGN_LISTING_OR_ADR" as const:"LOCAL_LISTING" as const,
   identitySeedVerified:identityVerified,issuerDocumentObserved:!!issuerDocs,
   researchCandleAvailable:!!candle,committeeResearchAvailable:!!committeeEntry,
   countryCatalogueHasReferences:!!countryCovered,
   // COUNTRY stock count != this security's provider identity.
   countryOrdinaryShareReferences:countryCovered?country!.instrumentTypes?.["Common Stock"]??0:null,
   tickerMatchedToProviderCatalogue:false as const,
   evidenceCount:[identityVerified,!!issuerDocs,!!candle,!!committeeEntry].filter(Boolean).length,
   nextDataActions:missing,
   currentBidAskVerified:false as const,returnForecastPercent:null,investmentScore:null,
   brokerOrderAllowed:false as const,paperExecutionAllowed:false as const,liveTradingAllowed:false as const,
  });
 }
 rows.sort((a,b)=>b.evidenceCount-a.evidenceCount||a.issuerRegion!.localeCompare(b.issuerRegion!)||a.symbol.localeCompare(b.symbol));
 return {
  generatedAt:new Date(now).toISOString(),catalogueAgeHours,catalogueRecent,safetyValid,
  summary:{
   internationalSeedEquities:rows.length,
   locallyListed:rows.filter(x=>x.listingType==="LOCAL_LISTING").length,
   foreignListedOrAdr:rows.filter(x=>x.listingType==="FOREIGN_LISTING_OR_ADR").length,
   withIssuerDocuments:rows.filter(x=>x.issuerDocumentObserved).length,
   withCommitteeResearch:rows.filter(x=>x.committeeResearchAvailable).length,
   executionGradeInternationalQuotes:0,
   tradingAllowed:0,
  },
  rows,
  policy:{
   researchOnly:true as const,
   sourceCountryCoverageNotTickerCoverage:true as const,
   historicalCandleNotLastTrade:true as const,
   noNewPaperCertification:true as const,
   paperExecutionAllowed:false as const,
   liveTradingAllowed:false as const,
  },
 };
}
