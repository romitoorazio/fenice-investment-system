/**
 * ONE GLOBAL global delayed/EOD file intake (private research only).
 * No network, brokerage access, source licence assertion or EOD PAPER fills.
 * A print of a transaction is NEVER promoted to an official exchange close.
 */
import {createHash} from "node:crypto";
import {inflateRawSync} from "node:zlib";

const fail=(reason)=>{throw Error("FREE_WORLD_FILE_"+reason);};
const dateOK=d=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)
  &&!Number.isNaN(Date.parse(d+"T00:00:00Z"))
  &&new Date(d+"T00:00:00Z").toISOString().slice(0,10)===d;
const symbolOK=x=>typeof x==="string"&&/^[A-Za-z0-9.^_\-]{1,24}$/.test(x);
const norm=x=>String(x||"").trim().toUpperCase();
const num=x=>{
  const s=String(x??"").trim();
  if(!/^(?:\d+)(?:\.\d+)?$/.test(s))fail("INVALID_DECIMAL");
  const n=Number(s);
  if(!Number.isFinite(n)||n<=0)fail("NON_POSITIVE_PRICE");
  return n;
};
const sha=b=>createHash("sha256").update(b).digest("hex");
export const FREE_WORLD_FILE_MAX_BYTES=160_000_000;
const markets={
  XAMS:"Euronext Amsterdam",XBRU:"Euronext Brussels",XDUB:"Euronext Dublin",
  XLIS:"Euronext Lisbon",XMIL:"Euronext Milan",XOSL:"Euronext Oslo",XPAR:"Euronext Paris",
  XETR:"Xetra",XFRA:"Frankfurt",XLON:"London",
  XNYS:"NYSE",XNAS:"Nasdaq",XTKS:"Tokyo",XHKG:"Hong Kong",
  XASX:"Australia ASX",XNSE:"India NSE",XBOM:"India BSE",
  XSHG:"Shanghai",XSHE:"Shenzhen",XKRX:"Korea",XTAI:"Taiwan",
  XJSE:"Johannesburg",XTSE:"Toronto",XTSX:"Toronto Venture",
  BVMF:"Brazil B3",XMEX:"Mexico",XSWX:"Switzerland",
  XSES:"Singapore",XSAU:"Saudi Arabia",XIST:"Istanbul",
  XWBO:"Vienna",XWAR:"Warsaw"
};
export const FREE_WORLD_FILE_MARKETS=Object.freeze(markets);
export const EURONEXT_FREE_MICS=Object.freeze(["XAMS","XBRU","XDUB","XLIS","XMIL","XOSL","XPAR"]);
const requireMic=x=>{
  if(typeof x!=="string"||!(/^[A-Z0-9]{4}$/).test(x))fail("INVALID_MIC");
  // Other ISO MICs can be handled as research; not a claim of source coverage.
  return x;
};
const sourceMeta=(p,classification)=>{
  const mic=requireMic(p.mic);
  if(!dateOK(p.sessionDate)||!symbolOK(p.symbol)
     ||!(/^[A-Z]{3}$/).test(p.currency||"")
     ||typeof p.providerId!=="string"||!(/^[a-z0-9._-]{3,64}$/).test(p.providerId))
    fail("INVALID_EXPECTED_METADATA");
  if(typeof p.sourceUrl!=="string"||!/^https:\/\/[a-z0-9.-]+(?:\/|$)/i.test(p.sourceUrl))
    fail("SOURCE_URL_REQUIRED");
  return {mode:"ONE_GLOBAL_FREE_WORLD_FILE_RESEARCH_ONLY",
    mic,marketName:markets[mic]||"Other MIC (unverified)",
    symbol:p.symbol,currency:p.currency,sessionDate:p.sessionDate,
    providerId:p.providerId,sourceUrl:p.sourceUrl,
    fileKind:classification,sourceFamily:p.providerId,
    venueAndSymbolIndependentlyCertified:false,
    providerRightsIndependentlyCertified:false,
    verifiedOfficialClose:false,independentProviderReceipts:0,
    paperEligible:false,phase9Credit:0,liveTradingAllowed:false,
    brokerConnectivityAllowed:false};
};
/** RFC4180-ish CSV/semicolon parser; quotes/CRLF/BOM/multiline, rejects broken quotes. */
export function parseWorldDelimited(data,delimiter=","){
  if(typeof data!=="string"||data.length===0||data.length>FREE_WORLD_FILE_MAX_BYTES)
    fail("CSV_SIZE");
  if(![",",";","\t"].includes(delimiter))fail("DELIMITER");
  let v=data.charCodeAt(0)===0xfeff?data.slice(1):data,rows=[],row=[],cell="",quoted=false,ended=false;
  for(let i=0;i<v.length;i++){
    const c=v[i];
    if(quoted){
      if(c==='"'){if(v[i+1]==='"'){cell+='"';i++;}else{quoted=false;ended=true;}}
      else cell+=c;
    }else if(c==='"'){
      if(cell.length||ended)fail("BROKEN_CSV_QUOTING");
      quoted=true;
    }else if(c===delimiter){row.push(cell);cell="";ended=false;}
    else if(c==="\r"||c==="\n"){
      if(c==="\r"&&v[i+1]==="\n")i++;
      row.push(cell);cell="";ended=false;
      if(row.some(t=>t.length))rows.push(row);
      row=[];
      if(rows.length>1_800_000)fail("TOO_MANY_ROWS");
    }else {
      if(ended)fail("CSV_TEXT_AFTER_QUOTE");
      cell+=c;
    }
  }
  if(quoted)fail("UNCLOSED_CSV_QUOTE");
  row.push(cell);
  if(row.some(t=>t.length))rows.push(row);
  if(rows.length<2)fail("CSV_MISSING_ROWS");
  return rows;
}
const aliases={
  date:["DATE","TRADINGDATE","TRADDT","TIMESTAMP","TRADEDATE"],
  symbol:["SYMBOL","TICKER","TCKRSYMB","TICKERSYMBOL","SECURITY","INSTRUMENT"],
  close:["CLOSE","CLOSINGPRICE","CLSPRIC","CLOSE_PRICE","LAST"],
  mic:["MIC","VENUE","EXCHANGEMIC"],
  currency:["CURRENCY","CURRENCYCODE","CCY"]
};
const colname=x=>norm(x).replace(/[^A-Z0-9]/g,"");
const headerIndex=(head,names)=>head.findIndex(h=>names.map(colname).includes(colname(h)));
const checksum=bytes=>{
  if(!(typeof bytes==="string"||Buffer.isBuffer(bytes)))fail("INPUT_BYTES_REQUIRED");
  return sha(bytes);
};
export function readFreeWorldEodCsv({csv,rawBytes,metadata,delimiter=","}){
  const data=csv??(Buffer.isBuffer(rawBytes)?rawBytes.toString("utf8"):null);
  const meta=sourceMeta(metadata,"UNVERIFIED_PUBLISHER_EOD_BAR_CSV");
  const rows=parseWorldDelimited(data,delimiter),head=rows[0];
  const iDate=headerIndex(head,aliases.date),iSymbol=headerIndex(head,aliases.symbol),
    iClose=headerIndex(head,aliases.close),iMic=headerIndex(head,aliases.mic),
    iCurrency=headerIndex(head,aliases.currency);
  if(Math.min(iDate,iSymbol,iClose)<0||new Set(head.map(colname)).size!==head.length)
    fail("REQUIRED_EOD_CSV_COLUMNS_MISSING_OR_DUPLICATED");
  let chosen=null,count=0;
  for(const row of rows.slice(1)){
    if(row.length!==head.length)fail("INCONSISTENT_EOD_ROW");
    if(norm(row[iSymbol])!==norm(meta.symbol))continue;
    count++;
    if(row[iDate]!==meta.sessionDate)continue;
    if(chosen)fail("DUPLICATE_SYMBOL_SESSION_CLOSE");
    if(iMic!==-1&&norm(row[iMic])!==meta.mic)fail("VENUE_MISMATCH");
    if(iCurrency!==-1&&norm(row[iCurrency])!==meta.currency)fail("CURRENCY_MISMATCH");
    chosen=num(row[iClose]);
  }
  if(chosen===null)fail("TARGET_SYMBOL_SESSION_NOT_FOUND");
  return {...meta,foundTargetRows:count,referenceCloseLocal:chosen,
    rawPayloadSha256:checksum(rawBytes??Buffer.from(data,"utf8")),
    barSchemaValidated:true,sourceTimestampCertified:false,
    officialCloseNotVerified:true,
    note:"Local EOD bar parsed for research, not a certified EOD publisher receipt or PAPER fill."};
}
const crc32=buf=>{
  let c=0xffffffff;
  for(const b of buf){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}
  return (c^0xffffffff)>>>0;
};
/** One member, bounded, CRC-checked ZIP; no shell, no external unzip needed. */
export function unzipSingleFreeWorldCsv(buf){
  if(!Buffer.isBuffer(buf)||buf.length<22||buf.length>FREE_WORLD_FILE_MAX_BYTES)
    fail("ZIP_SIZE");
  let e=-1;
  for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--){
    if(buf.readUInt32LE(i)===0x06054b50){e=i;break;}
  }
  if(e<0||buf.readUInt16LE(e+4)!==0||buf.readUInt16LE(e+6)!==0
    ||buf.readUInt16LE(e+8)!==1||buf.readUInt16LE(e+10)!==1)
    fail("ZIP_SINGLE_MEMBER_REQUIRED");
  const central=buf.readUInt32LE(e+16);
  if(central+46>buf.length||buf.readUInt32LE(central)!==0x02014b50)
    fail("ZIP_CENTRAL_INVALID");
  const flags=buf.readUInt16LE(central+8),method=buf.readUInt16LE(central+10),
    crc=buf.readUInt32LE(central+16),packed=buf.readUInt32LE(central+20),
    unpacked=buf.readUInt32LE(central+24),fn=buf.readUInt16LE(central+28),
    extra=buf.readUInt16LE(central+30),comment=buf.readUInt16LE(central+32),
    local=buf.readUInt32LE(central+42);
  if(flags&1||![0,8].includes(method)||unpacked>FREE_WORLD_FILE_MAX_BYTES
    ||central+46+fn+extra+comment>e||local+30>central
    ||buf.readUInt32LE(local)!==0x04034b50)fail("ZIP_HEADER_INVALID");
  const name=buf.subarray(central+46,central+46+fn).toString("utf8");
  if(!/^[a-zA-Z0-9_. -]+\.csv$/i.test(name))fail("ZIP_CSV_NAME_INVALID");
  const localName=buf.subarray(local+30,local+30+buf.readUInt16LE(local+26)).toString("utf8");
  if(localName!==name||buf.readUInt16LE(local+8)!==method||buf.readUInt16LE(local+6)!==flags)
    fail("ZIP_LOCAL_CENTRAL_MISMATCH");
  const offset=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28);
  if(offset+packed>central)fail("ZIP_LENGTH_INVALID");
  const compressed=buf.subarray(offset,offset+packed);
  let data;
  try{data=method===0?compressed:inflateRawSync(compressed,{maxOutputLength:FREE_WORLD_FILE_MAX_BYTES});}
  catch{fail("ZIP_DECOMPRESSION_INVALID");}
  if(data.length!==unpacked||crc32(data)!==crc)fail("ZIP_CRC_MISMATCH");
  return {filename:name,csv:data.toString("utf8"),bytes:data};
}
/** Euronext delayed trade prints are NOT official closes, even if last in time. */
export function readEuronextTradeCsv({csv,rawBytes,metadata}){
  const meta=sourceMeta(metadata,"EURONEXT_MIFID_DELAYED_TRADE_PRINTS");
  if(!EURONEXT_FREE_MICS.includes(meta.mic)||!/^([A-Z]{2}[A-Z0-9]{10})$/.test(metadata.isin||""))
    fail("EURONEXT_MIC_OR_ISIN_REQUIRED");
  const data=csv??(Buffer.isBuffer(rawBytes)?rawBytes.toString("utf8"):null);
  if(typeof data!=="string")fail("CSV_REQUIRED");
  const firstLine=data.split(/\r?\n/,1)[0];
  const feed=/euronext|copyright|all rights reserved/i.test(firstLine)
    &&!/tradingdatetime/i.test(firstLine)
    ?data.slice(data.indexOf("\n")+1):data;
  const rows=parseWorldDelimited(feed);
  const head=rows[0]??[];
  const fields=["TradingDateTime","MifidInstrumentID","MifidPrice","MifidCurrency","Venue"];
  const idx=fields.map(f=>head.findIndex(x=>colname(x)===colname(f)));
  if(idx.some(i=>i<0)||new Set(head.map(colname)).size!==head.length)fail("EURONEXT_COLUMNS_INVALID");
  let count=0,lastTs=null;
  for(const row of rows.slice(1)){
    if(row.length!==head.length)fail("EURONEXT_ROW_INVALID");
    if(norm(row[idx[1]])!==metadata.isin)continue;
    if(norm(row[idx[4]])!==meta.mic||norm(row[idx[3]])!==meta.currency)
      fail("EURONEXT_VENUE_CURRENCY_MISMATCH");
    const dateTime=Date.parse(row[idx[0]]);
    if(!Number.isFinite(dateTime)||new Date(dateTime).toISOString().slice(0,10)!==meta.sessionDate)
      fail("EURONEXT_SESSION_DATE_OR_TIME_INVALID");
    num(row[idx[2]]);
    count++;
    lastTs=Math.max(lastTs??-Infinity,dateTime);
  }
  if(count===0)fail("EURONEXT_ISIN_NOT_FOUND");
  return {...meta,isin:metadata.isin,tradePrintCount:count,
    latestTradePrintAt:new Date(lastTs).toISOString(),
    rawPayloadSha256:checksum(rawBytes??Buffer.from(data,"utf8")),
    officialCloseNotVerified:true,referenceCloseLocal:null,
    note:"Delayed transaction prints only; auction closing price, corrections and official close NOT established."};
}
