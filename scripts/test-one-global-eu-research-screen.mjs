import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {
  ONE_GLOBAL_MILAN_RESEARCH_CANDIDATES,screenOneGlobalMilanResearchPair,
} from '../lib/market/one-global-eu-research-screen.mjs';

// All trades below are synthetic fixtures, never market data or original
// receipts. The reader must verify one whole ZIP and six strict ISIN rows.
const sessionDate='2026-11-13',observedAt='2026-11-13T18:30:00.000Z';
const HEADER=['TradingDateTime','PublicationDateTime','MifidInstrumentID','MifidPrice','MifidQuantity',
  'MifidPriceNotation','MifidCurrency','MmtMarketMechanism','MmtNegotiationIndicator','MmtModificationIndicator',
  'MmtBenchMarkIndicator','MmtContributionToPrice','MmtAlgorithmicIndicator','MmtPublicationMode','Venue',
  'ThirdCountryTradingVenueExecution','TradeUniqueIdentifier','MissingPrice','MmtContingentTransactionIndicator','VenueOfPublication'];
let table;
function crc32(bytes){
  table??=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;
}
function zipCsv(text){
  const name=Buffer.from('Trades_Equities.csv'),data=Buffer.from(text),compressed=deflateRawSync(data),crc=crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);
  local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
  central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);
  central.writeUInt32LE(data.length,24);central.writeUInt32LE(name.length,28);
  const offset=local.length+name.length+compressed.length,eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50);eocd.writeUInt16LE(1,8);eocd.writeUInt16LE(1,10);
  eocd.writeUInt32LE(central.length+name.length,12);eocd.writeUInt32LE(offset,16);
  return Buffer.concat([local,name,compressed,central,name,eocd]);
}
const q=x=>'"'+String(x).replaceAll('"','""')+'"';
function euronextRow({at,isin,price,id,quantity=123}){
  const publishedAt=at.replace('000000Z','001000Z');
  return [at,publishedAt,isin,price,quantity,'MONE','EUR','1','-','-','-','-','-','-','MTAA','',id,'','-','MTAA']
    .map(q).join(',');
}
const sorted=[...ONE_GLOBAL_MILAN_RESEARCH_CANDIDATES].sort((a,b)=>a.symbol.localeCompare(b.symbol));
assert.deepEqual(sorted.map(x=>x.symbol),['BAMI','ENEL','ENI','ISP','TRN','UCG']);
assert.equal(new Set(sorted.map(x=>x.isin)).size,6,'Six exact, distinct ISINs');
const rows=[],cboe=[];
for(const {symbol,isin} of sorted){
  for(let i=0;i<12;i++){
    const seconds=String(i).padStart(2,'0');
    const at='2026-11-13T08:30:'+seconds+'.000000Z';
    const id=createHash('sha256').update(symbol+'-'+i).digest('hex').slice(0,18);
    rows.push(euronextRow({at,isin,price:(9.8+i*.01).toFixed(7),id,quantity:100+i}));
  }
  const down=['BAMI','ENI'].includes(symbol),close=down?'9.7500000':'10.0200000';
  rows.push(euronextRow({at:'2026-11-13T16:35:02.000000Z',isin,price:close,
    id:createHash('sha256').update(symbol+'-auction').digest('hex').slice(0,18),quantity:500}));
  // UCG deliberately has no exact Cboe pre-close trade. TRN is divergent.
  if(symbol==='UCG')continue;
  const second=symbol==='TRN'?'8.5000':down?'9.7400':'10.0100';
  cboe.push('2026-11-13 16:29:59.000000,'+isin+','+second
    +',EUR,MONE,20,CEUX,CLOB,2026-11-13 16:29:59.001000,CEUX,TRADER123,""');
}
const raw=zipCsv('(c) 2026 Euronext N.V. All Rights Reserved.\n'+HEADER.join(',')+'\n'+rows.join('\n')+'\n');
const independent=Buffer.from(cboe.join('\n')+'\n');
const input={euronextRaw:raw,cboeRaw:independent,sessionDate,observedAt};
const result=screenOneGlobalMilanResearchPair(input);
assert.equal(result.candidateCount,6);
assert.equal(result.validPairs,5);
assert.equal(result.agreedPairs,4);
assert.equal(result.researchUptrends,2);
assert.equal(result.sourceIncomplete,1);
assert.equal(result.divergentPairs,1);
const bySymbol=Object.fromEntries(result.candidates.map(x=>[x.symbol,x]));
for(const [symbol,status] of Object.entries({
  ENEL:'UPTREND_RESEARCH_ONLY',ISP:'UPTREND_RESEARCH_ONLY',
  BAMI:'NO_UPTREND',ENI:'NO_UPTREND',
  TRN:'VENUE_CLOSE_DIVERGENCE',UCG:'SOURCE_PAIR_INCOMPLETE',
}))assert.equal(bySymbol[symbol].status,status,symbol);
for(const candidate of result.candidates){
  assert.equal(candidate.eligibleForPaper,false);
  assert.equal(candidate.sourceRightsVerified,false);
}
assert.equal(result.originalPrivateJournalRead,false);
assert.equal(result.originalPrivateJournalChanged,false);
assert.equal(result.paperExecutionAllowed,false);
assert.equal(result.createsSignals,0);
assert.equal(result.paperFillsCreated,0);
assert.equal(result.phase9Credit,0);
assert.equal(result.brokerConnectivityAllowed,false);
assert.equal(result.liveTradingAllowed,false);
assert.equal(result.rawPricesPublished,false);
const visible=JSON.stringify(result);
assert.doesNotMatch(visible,/9\.8000000|10\.0200000|9\.7400|8\.5000|TRADER123|Trades_Equities/);
assert.doesNotMatch(visible,/payloadSha256|rawEvidence|secret|rawPayload/);
const tampered=Buffer.from(raw);tampered[61]^=1;
assert.throws(()=>screenOneGlobalMilanResearchPair({...input,euronextRaw:tampered}),/EU_DELAYED_EOD_ZIP_/);
assert.throws(()=>screenOneGlobalMilanResearchPair({...input,cboeRaw:Buffer.from('x')}),/EU_RESEARCH_SCREEN_INPUT_INVALID/);
assert.throws(()=>screenOneGlobalMilanResearchPair({...input,sessionDate:'2026-11-14'}),/EU_RESEARCH_SCREEN_INPUT_INVALID/);
assert.throws(()=>screenOneGlobalMilanResearchPair({...input,sessionDate:'2027-01-04'}),/EU_RESEARCH_SCREEN_INPUT_INVALID/);
assert.throws(()=>screenOneGlobalMilanResearchPair({...input,observedAt:'2026-11-13T12:00:00.000Z'}),/EU_RESEARCH_SCREEN_INPUT_INVALID/);
console.log('PASS official-interface synthetic Milan six-ISIN research: whole ZIP verified once, exact dual venues, missing/divergent/neutral/uptrend classification; no PAPER/LIVE or raw data.');
