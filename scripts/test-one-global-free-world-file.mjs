import assert from "node:assert/strict";
import {tmpdir} from "node:os";
import {mkdtempSync,writeFileSync,readFileSync,statSync,rmSync} from "node:fs";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {
 FREE_WORLD_FILE_MARKETS,EURONEXT_FREE_MICS,parseWorldDelimited,
 readFreeWorldEodCsv,readEuronextTradeCsv,unzipSingleFreeWorldCsv,euronextDelayedEquitiesZipUrl,
} from "../lib/market/one-global-free-world-file.mjs";
const base={mic:"XMIL",symbol:"BAMI",currency:"EUR",sessionDate:"2026-11-13",
  providerId:"public-eod-test",sourceUrl:"https://example.org/daily.csv"};
const sample="Date,Symbol,Mic,Currency,Close\n2026-11-13,BAMI,XMIL,EUR,10.25\n2026-11-13,ENEL,XMIL,EUR,8.30\n";
const r=readFreeWorldEodCsv({csv:sample,metadata:base});
assert.equal(r.referenceCloseLocal,10.25);
assert.equal(r.mic,"XMIL");
assert.equal(r.paperEligible,false);
assert.equal(r.verifiedOfficialClose,false);
assert.equal(r.providerRightsIndependentlyCertified,false);
assert.equal(r.independentProviderReceipts,0);
assert.equal(r.phase9Credit,0);
assert.equal(r.brokerConnectivityAllowed,false);
assert.equal(r.liveTradingAllowed,false);
assert.match(r.rawPayloadSha256,/^[a-f0-9]{64}$/);
assert(FREE_WORLD_FILE_MARKETS.XTKS&&FREE_WORLD_FILE_MARKETS.XASX
  &&FREE_WORLD_FILE_MARKETS.XHKG&&FREE_WORLD_FILE_MARKETS.XNYS
  &&FREE_WORLD_FILE_MARKETS.XNSE&&FREE_WORLD_FILE_MARKETS.XJSE);
assert(EURONEXT_FREE_MICS.includes("XMIL"));
assert.equal(euronextDelayedEquitiesZipUrl("XMIL"),
 "https://marketdata.euronext.com/data-reporting-service/trades-file/download/EQUITIES/PREVIOUS_TRADING_DAY/MIL");
assert.throws(()=>euronextDelayedEquitiesZipUrl("XASX"),/FREE_WORLD_FILE_/);
assert.equal(parseWorldDelimited("Symbol;Company\nBAMI;\"Banco, BPM\"\n",";")[1][1],"Banco, BPM");
assert.throws(()=>parseWorldDelimited("a,b\n\"oops,2\n"),/UNCLOSED_CSV_QUOTE/);
const bad=(csv,metadata=base)=>assert.throws(()=>readFreeWorldEodCsv({csv,metadata}),/FREE_WORLD_FILE_/);
bad(sample.replace("10.25","0"));
bad(sample.replace("XMIL,EUR,10.25","XPAR,EUR,10.25"));
bad(sample.replace("XMIL,EUR,10.25","XMIL,USD,10.25"));
bad(sample+"2026-11-13,BAMI,XMIL,EUR,10.25\n");
bad(sample.replace("Date,Symbol,Mic,Currency,Close","Date,Symbol,Mic,Currency,Wrong"));
bad(sample,{...base,sessionDate:"2026-11-14"});
bad(sample,{...base,sourceUrl:"http://example.org/file.csv"});
const nse="TradDt,TckrSymb,ClsPric\n2026-11-13,SBIN,881.50\n";
const indian=readFreeWorldEodCsv({csv:nse,metadata:{...base,mic:"XNSE",symbol:"SBIN",currency:"INR",
  providerId:"nse-official-report",sourceUrl:"https://www.nseindia.com/all-reports"}});
assert.equal(indian.referenceCloseLocal,881.5);
assert.equal(indian.venueAndSymbolIndependentlyCertified,false);
const trades="© Euronext NV terms\nTradingDateTime,PublicationDateTime,MifidInstrumentID,MifidPrice,MifidCurrency,Venue\n2026-11-13T10:00:00Z,2026-11-13T10:15:00Z,IT0005218380,10.1,EUR,XMIL\n2026-11-13T10:10:00Z,2026-11-13T10:25:00Z,IT0005218380,10.2,EUR,XMIL\n2026-11-13T10:15:00Z,2026-11-13T10:30:00Z,IT0001234567,22,EUR,XMIL\n";
const em={...base,isin:"IT0005218380",providerId:"euronext-delayed",
 sourceUrl:"https://marketdata.euronext.com/data-reporting-service/trades-file"};
const tr=readEuronextTradeCsv({csv:trades,metadata:em});
assert.equal(tr.tradePrintCount,2);
assert.equal(tr.referenceCloseLocal,null);
assert.equal(tr.verifiedOfficialClose,false);
assert.equal(tr.paperEligible,false);
assert.equal(tr.latestTradePrintAt,"2026-11-13T10:10:00.000Z");
assert.throws(()=>readEuronextTradeCsv({csv:trades,metadata:{...em,isin:"IT0000000000"}}),/ISIN_NOT_FOUND/);
assert.throws(()=>readEuronextTradeCsv({csv:trades.replace("EUR,XMIL","EUR,XPAR"),metadata:em}),/VENUE_CURRENCY_MISMATCH/);
assert.throws(()=>readEuronextTradeCsv({csv:trades,metadata:{...em,mic:"XTKS"}}),/MIC_OR_ISIN_REQUIRED/);
// Construct a minimal valid one-file ZIP (stored method) to exercise ZIP import without third-party libs.
const crc32=buf=>{
 let c=0xffffffff;
 for(const b of buf){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}
 return (c^0xffffffff)>>>0;
};
const makeZip=(text)=>{
 const data=Buffer.from(text),name=Buffer.from("Trades_Equities.csv"),crc=crc32(data);
 const local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
 local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
 local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);
 local.writeUInt16LE(name.length,26);
 central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
 central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);
 central.writeUInt16LE(name.length,28);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
 end.writeUInt32LE(central.length+name.length,12);
 end.writeUInt32LE(local.length+name.length+data.length,16);
 return Buffer.concat([local,name,data,central,name,end]);
};
const zip=makeZip(trades);
assert.equal(unzipSingleFreeWorldCsv(zip).csv,trades);
const broken=Buffer.from(zip);broken[43]^=0x7f;
assert.throws(()=>unzipSingleFreeWorldCsv(broken),/FREE_WORLD_FILE_/);
const folder=mkdtempSync(join(tmpdir(),"fenice-free-world-"));
try{
  const file=join(folder,"euronext.zip"),output=join(folder,"private-report.json");
  writeFileSync(file,zip);
  const args=[
    "scripts/import-one-global-free-world-file.mjs","--input="+file,
    "--kind=euronext","--mic=XMIL","--symbol=BAMI","--currency=EUR",
    "--session=2026-11-13","--provider=euronext-delayed",
    "--source-url=https://marketdata.euronext.com/data-reporting-service/trades-file",
    "--isin=IT0005218380",
  ];
  const dry=spawnSync(process.execPath,args,{encoding:"utf8"});
  assert.equal(dry.status,0,dry.stderr);
  assert.equal(JSON.parse(dry.stdout).committedToPrivateDisk,false);
  const result=spawnSync(process.execPath,[...args,"--output="+output,"--commit"],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).committedToPrivateDisk,true);
  assert.equal(readFileSync(output,"utf8").includes("referenceCloseLocal"),true);
  if(process.platform!=="win32")assert.equal(statSync(output).mode&0o777,0o600);
  const repeat=spawnSync(process.execPath,[...args,"--output="+output,"--commit"],{encoding:"utf8"});
  assert.notEqual(repeat.status,0,"No overwriting stored evidence");
  const unsafe=spawnSync(process.execPath,[
    "scripts/import-one-global-free-world-file.mjs","--input="+resolve("package.json"),
    ...args.slice(2)
  ],{encoding:"utf8"});
  assert.notEqual(unsafe.status,0,"Never read private source files from public Git repository");
}finally{rmSync(folder,{force:true,recursive:true});}
console.log("PASS global free file CSV/ZIP research intake, NSE and Euronext fixtures, rights and broker fail-closed, private permissions.");
