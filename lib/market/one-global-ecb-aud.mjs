/**
 * ONE GLOBAL CBA pilot: European Central Bank AUD/EUR daily reference rate.
 *
 * ECB series EXR.D.AUD.EUR.SP00.A quotes AUD per ONE EUR. To convert a
 * hypothetical Australian PAPER notional into EUR, use 1 / OBS_VALUE.
 * This is NOT a broker's executable FX quote, not a real-time FX attestation
 * and not independently audited strategy performance.
 *
 * The private collector (separate script) pins the actual HTTPS ECB origin.
 */
import {createHash} from "node:crypto";

const isoDay=value=>typeof value==="string"&&/^\d{4}-\d\d-\d\d$/.test(value)
  &&Number.isFinite(Date.parse(value+"T00:00:00.000Z"))
  &&new Date(Date.parse(value+"T00:00:00.000Z")).toISOString().slice(0,10)===value;
const iso=value=>typeof value==="string"&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&
  Number.isFinite(Date.parse(value))&&new Date(Date.parse(value)).toISOString()===value;
const days=(a,b)=>(Date.parse(b+"T00:00:00.000Z")-Date.parse(a+"T00:00:00.000Z"))/86400000;

function pastConservativeEcbPublicationWindow(referenceDate,observedAt){
  // The API does not provide an immutable *individual-row* release time.
  // Require a conservative post-16:10 Frankfurt local window on the row's
  // date; any later local day is acceptable. This is an admission buffer,
  // NOT a claim that ECB actually published the rate at 16:10.
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
    timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23",
  }).formatToParts(new Date(observedAt)).map(x=>[x.type,x.value]));
  const localDate=parts.year+"-"+parts.month+"-"+parts.day;
  const minute=Number(parts.hour)*60+Number(parts.minute);
  return localDate>referenceDate || (localDate===referenceDate&&minute>=16*60+10);
}
const sha=x=>createHash("sha256").update(x).digest("hex");
function fail(reason){throw Error("EOD_AUD_FX_"+reason);}
function csvRows(raw){
  if(typeof raw!=="string"||raw.length>150000||raw.length<20)fail("CSV_SIZE_INVALID");
  const records=[],row=[];let cell="",quotes=false;
  for(let i=0;i<raw.length;i++){
    const c=raw[i];
    if(c==='"'){
      if(quotes&&raw[i+1]==='"'){cell+='"';i++;}
      else if(!quotes&&cell.length===0)quotes=true;
      else if(quotes)quotes=false;
      else fail("CSV_QUOTING_INVALID");
    }else if((c===","||c==="\n"||c==="\r")&&!quotes){
      row.push(cell);cell="";
      if(c!==","){
        if(c==="\r"&&raw[i+1]==="\n")i++;
        if(row.some(x=>x!==""))records.push([...row]);
        row.length=0;
      }
    }else cell+=c;
  }
  if(quotes)fail("CSV_QUOTING_INVALID");
  if(cell!==""||row.length){row.push(cell);records.push([...row]);}
  if(records.length<2||records.length>100)fail("CSV_ROW_COUNT_INVALID");
  const head=records.shift().map(x=>x.replace(/^\uFEFF/,"").trim());
  const required=["FREQ","CURRENCY","CURRENCY_DENOM","EXR_TYPE",
    "EXR_SUFFIX","TIME_PERIOD","OBS_VALUE"];
  if(new Set(head).size!==head.length||required.some(x=>!head.includes(x)))
    fail("CSV_COLUMNS_INVALID");
  return records.map(fields=>{
    if(fields.length!==head.length)fail("CSV_FIELD_COUNT_MISMATCH");
    return Object.fromEntries(head.map((k,j)=>[k,fields[j]]));
  });
}

/** Select last ECB reference strictly BEFORE the ASX settlement date. */
export function selectEcbAudReference({csv,sessionDate,observedAt}){
  if(!isoDay(sessionDate)||!iso(observedAt))
    fail("SESSION_OR_FETCH_TIME_INVALID");
  const rows=csvRows(csv),valid=new Map();
  for(const row of rows){
    if(row.FREQ!=="D"||row.CURRENCY!=="AUD"||row.CURRENCY_DENOM!=="EUR"
      ||row.EXR_TYPE!=="SP00"||row.EXR_SUFFIX!=="A"
      ||!isoDay(row.TIME_PERIOD))fail("WRONG_ECB_SERIES_OR_PERIOD");
    if(valid.has(row.TIME_PERIOD))fail("DUPLICATED_ECB_REFERENCE_DATE");
    const rate=Number(row.OBS_VALUE);
    if(!row.OBS_VALUE||!Number.isFinite(rate)||rate<=0||rate>100
      ||(row.OBS_STATUS!==undefined&&
         !["","A"].includes(row.OBS_STATUS)))
      fail("AUD_REFERENCE_VALUE_OR_STATUS_INVALID");
    valid.set(row.TIME_PERIOD,rate);
  }
  const eligible=[...valid].filter(([date])=>date<sessionDate
    &&days(date,sessionDate)<=7
    &&pastConservativeEcbPublicationWindow(date,observedAt))
    .sort(([a],[b])=>a.localeCompare(b));
  if(!eligible.length)fail("NO_PUBLISHED_PRIOR_SESSION_AUD_REFERENCE");
  const [referenceDate,audPerEuro]=eligible.at(-1);
  return {
    mode:"ONE_GLOBAL_ECB_AUD_DAILY_REFERENCE_PRIVATE",
    series:"EXR.D.AUD.EUR.SP00.A",
    referenceDate,
    sessionDate,
    audPerEuro,
    unitsPerEuro:audPerEuro,currency:"AUD",
    rateToEuro:1/audPerEuro,
    source:"ECB_REFERENCE_ONLY",
    publishedAt:observedAt, // first OBSERVED AT OUR FETCH, not ECB actual release
    timestampMeaning:"FIRST_OBSERVED_AT_SOURCE_FETCH_NOT_OFFICIAL_RELEASE",
    ecbResponseSha256:sha(csv),sourceFormat:"OFFICIAL_ECB_SDMX_CSV",
    referenceOnly:true,marketExecutionEligible:false,
    licensedEquityClosesCount:0,independentEquityCloseReceipts:0,
    phase9Credit:0,liveTradingAllowed:false,brokerConnectivityAllowed:false,
  };
}

/**
 * ECB's alternative official XML feed (last 90 days). This remains the SAME
 * publisher; it is a resilience fallback for FX, NOT an independent quote.
 * Reject XML entities/DOCTYPE and unsupported syntax; no DOM/HTML eval.
 */
export function selectEcbAudXmlReference({xml,sessionDate,observedAt}){
  if(typeof xml!=="string"||xml.length<120||xml.length>350000
    ||/<!DOCTYPE|<!ENTITY|<script/i.test(xml)
    ||!xml.includes("European Central Bank")
    ||!xml.includes("eurofxref"))
    fail("OFFICIAL_XML_SOURCE_FORMAT_INVALID");
  const dateBlocks=[...xml.matchAll(
    /<Cube\s+time=(['"])(\d{4}-\d\d-\d\d)\1\s*>([\s\S]*?)<\/Cube>/g
  )];
  if(dateBlocks.length===0||dateBlocks.length>100)
    fail("OFFICIAL_XML_DATE_ROWS_INVALID");
  const rows=[],seen=new Set();
  for(const match of dateBlocks){
    const date=match[2],body=match[3];
    if(!isoDay(date)||seen.has(date))fail("OFFICIAL_XML_DUPLICATE_DATE");
    seen.add(date);
    const aud=[...body.matchAll(
      /<Cube\s+currency=(['"])AUD\1\s+rate=(['"])(\d+(?:\.\d+)?)\2\s*\/>/g
    )];
    if(aud.length>1)fail("OFFICIAL_XML_DUPLICATE_AUD_RATE");
    if(aud.length===1)rows.push({date,rate:aud[0][3]});
  }
  if(rows.length===0)fail("OFFICIAL_XML_AUD_NOT_FOUND");
  const csv=[
    "KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,OBS_STATUS",
    ...rows.map(o=>"EXR.D.AUD.EUR.SP00.A,D,AUD,EUR,SP00,A,"+o.date+","+o.rate+",A"),
  ].join("\n")+"\n";
  const fx=selectEcbAudReference({csv,sessionDate,observedAt});
  return {...fx,ecbResponseSha256:sha(xml),sourceFormat:"OFFICIAL_ECB_90D_XML"};
}

/** No private price or raw rate in console/public GitHub summary. */
export function summarizeEcbAudReference(fx){
  if(fx?.mode!=="ONE_GLOBAL_ECB_AUD_DAILY_REFERENCE_PRIVATE"||
    fx.referenceOnly!==true||fx.marketExecutionEligible!==false)
    fail("PUBLIC_SUMMARY_INPUT_INVALID");
  return {
    source:"ECB",series:fx.series,referenceDate:fx.referenceDate,
    sourceFormat:fx.sourceFormat,
    forAsxSessionDate:fx.sessionDate,status:"DAILY_REFERENCE_AVAILABLE_ONLY",
    noExecutableFxPrice:true, // FX is a REFERENCE conversion, not a broker quote
    noIndependentEquityCloseReceipts:true,
    equityPricesCertified:false,phase9Credit:0,
    liveTradingAllowed:false,brokerConnectivityAllowed:false,
  };
}
