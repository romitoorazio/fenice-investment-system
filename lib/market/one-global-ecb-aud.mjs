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
      if(c!==" ,".trim() && c!==","){
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
  if(!isoDay(sessionDate)||!iso(observedAt)
    ||Date.parse(observedAt)<Date.parse(sessionDate+"T00:00:00.000Z"))
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
    &&Date.parse(date+"T00:00:00.000Z")<Date.parse(observedAt))
    .sort(([a],[b])=>a.localeCompare(b));
  if(!eligible.length)fail("NO_PUBLISHED_PRIOR_SESSION_AUD_REFERENCE");
  const [referenceDate,audPerEuro]=eligible.at(-1);
  return {
    mode:"ONE_GLOBAL_ECB_AUD_DAILY_REFERENCE_PRIVATE",
    series:"EXR.D.AUD.EUR.SP00.A",
    referenceDate,
    sessionDate,
    audPerEuro,
    rateToEuro:1/audPerEuro,
    source:"ECB_REFERENCE_ONLY",
    publishedAt:observedAt, // first OBSERVED AT OUR FETCH, not ECB actual release
    timestampMeaning:"FIRST_OBSERVED_AT_SOURCE_FETCH_NOT_OFFICIAL_RELEASE",
    ecbResponseSha256:sha(csv),
    referenceOnly:true,marketExecutionEligible:false,
    licensedEquityClosesCount:0,independentEquityCloseReceipts:0,
    phase9Credit:0,liveTradingAllowed:false,brokerConnectivityAllowed:false,
  };
}

/** No private price or raw rate in console/public GitHub summary. */
export function summarizeEcbAudReference(fx){
  if(fx?.mode!=="ONE_GLOBAL_ECB_AUD_DAILY_REFERENCE_PRIVATE"||
    fx.referenceOnly!==true||fx.marketExecutionEligible!==false)
    fail("PUBLIC_SUMMARY_INPUT_INVALID");
  return {
    source:"ECB",series:fx.series,referenceDate:fx.referenceDate,
    forAsxSessionDate:fx.sessionDate,status:"DAILY_REFERENCE_AVAILABLE_ONLY",
    noExecutableFxPrice:false, // FX is a REFERENCE conversion, not a broker quote
    noIndependentEquityCloseReceipts:true,
    equityPricesCertified:false,phase9Credit:0,
    liveTradingAllowed:false,brokerConnectivityAllowed:false,
  };
}
