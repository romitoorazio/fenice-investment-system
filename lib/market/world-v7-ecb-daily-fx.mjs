/**
 * Official ECB JPY/EUR reference-history adapter for *historical research*.
 * ECB value = JPY per EUR; replay requires EUR per JPY, so invert it.
 * Never interpret a daily fixing as intraday executable FX or a broker quote.
 * Only fixing dates strictly BEFORE the signal day may be used downstream.
 */
const ECB_SERIES="EXR.D.JPY.EUR.SP00.A";
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function validDate(x) {
  return typeof x==="string" && DATE.test(x)
    && !Number.isNaN(Date.parse(x+"T00:00:00Z"))
    && new Date(x+"T00:00:00Z").toISOString().slice(0,10)===x;
}
function csvRecords(input) {
  const rows=[];let row=[],cell="",quoted=false;
  for (let i=0;i<input.length;i++) {
    const c=input[i];
    if (c==='"') {
      if (quoted && input[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    } else if(!quoted && c===","){row.push(cell);cell="";}
    else if(!quoted && (c==="\n"||c==="\r")) {
      if(c==="\r"&&input[i+1]==="\n")i++;
      row.push(cell);if(row.some(x=>x.length))rows.push(row);
      row=[];cell="";
    } else cell+=c;
  }
  if(quoted)throw Error("ECB_CSV_UNCLOSED_QUOTE");
  row.push(cell);if(row.some(x=>x.length))rows.push(row);
  return rows;
}
export function parseEcbJpyPerEuroCsv(raw,{startDate,endDate}={}) {
  if(!validDate(startDate)||!validDate(endDate)||startDate>endDate
    || typeof raw!=="string"||raw.length>300000||raw.length<24)
    return {status:"INVALID_ECB_HISTORY_PAYLOAD",fxRates:[]};
  let rows;
  try{rows=csvRecords(raw);}catch{return {status:"INVALID_ECB_HISTORY_PAYLOAD",fxRates:[]};}
  if(rows.length<2 || rows.length>800) return {status:"INVALID_ECB_HISTORY_PAYLOAD",fxRates:[]};
  const headers=rows[0].map(x=>x.trim().toUpperCase());
  const dateCol=headers.indexOf("TIME_PERIOD");
  const valueCol=headers.indexOf("OBS_VALUE");
  const keyCol=headers.indexOf("KEY");
  const freqCol=headers.indexOf("FREQ");
  const currencyCol=headers.indexOf("CURRENCY");
  const denomCol=headers.indexOf("CURRENCY_DENOM");
  const typeCol=headers.indexOf("EXR_TYPE");
  if(dateCol<0||valueCol<0||keyCol<0)return {status:"ECB_SERIES_NOT_PROVEN",fxRates:[]};
  const fxRates=[],seen=new Set();
  for(const row of rows.slice(1)) {
    if(row.length!==headers.length
      || row[keyCol].trim()!==ECB_SERIES
      || (freqCol>=0 && row[freqCol]!=="D")
      || (currencyCol>=0 && row[currencyCol]!=="JPY")
      || (denomCol>=0 && row[denomCol]!=="EUR")
      || (typeCol>=0 && row[typeCol]!=="SP00")
      || !validDate(row[dateCol]) || row[dateCol]<startDate || row[dateCol]>endDate
      || seen.has(row[dateCol]))
      return {status:"INVALID_ECB_HISTORY_ROW",fxRates:[]};
    seen.add(row[dateCol]);
    const rawValue=row[valueCol].trim();
    // Missing ECB observations may be blank; never coerce blank to zero.
    if(!rawValue)continue;
    if(!/^(?:[0-9]+)(?:\.[0-9]+)?$/.test(rawValue))return {status:"INVALID_ECB_FX_VALUE",fxRates:[]};
    const jpyPerEuro=Number(rawValue);
    if(!Number.isFinite(jpyPerEuro)||jpyPerEuro<=0)
      return {status:"INVALID_ECB_FX_VALUE",fxRates:[]};
    fxRates.push({date:row[dateCol],rateToEuro:1/jpyPerEuro});
  }
  fxRates.sort((a,b)=>a.date.localeCompare(b.date));
  return fxRates.length
    ? {status:"ECB_DAILY_REFERENCE_HISTORY_PARSED",fxRates,observations:fxRates.length}
    : {status:"NO_ECB_JPY_FX_OBSERVATIONS",fxRates:[]};
}
export async function fetchEcbJpyEurDailyHistory({
  startDate,endDate,fetchImpl=fetch,
}={}) {
  if(!validDate(startDate)||!validDate(endDate)||startDate>endDate
    || typeof fetchImpl!=="function")
    return {status:"INVALID_ECB_HISTORY_REQUEST",fxRates:[]};
  const url="https://data-api.ecb.europa.eu/service/data/EXR/D.JPY.EUR.SP00.A?startPeriod="
    +encodeURIComponent(startDate)+"&endPeriod="+encodeURIComponent(endDate)+"&format=csvdata";
  try{
    const response=await fetchImpl(url,{
      signal:AbortSignal.timeout(9000),redirect:"error",
      headers:{Accept:"text/csv,application/vnd.sdmx.csv,text/plain"},
    });
    if(!response?.ok) return {status:"ECB_REFERENCE_DATA_UNAVAILABLE",fxRates:[]};
    const contentType=String(response.headers?.get("content-type")||"");
    if(!/csv|text\/plain|octet-stream/i.test(contentType))
      return {status:"ECB_UNEXPECTED_CONTENT_TYPE",fxRates:[]};
    const raw=await response.text();
    return parseEcbJpyPerEuroCsv(raw,{startDate,endDate});
  }catch{return {status:"ECB_REFERENCE_DATA_UNAVAILABLE",fxRates:[]};}
}
