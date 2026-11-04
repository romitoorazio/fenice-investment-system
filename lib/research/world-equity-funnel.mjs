// Read-only Twelve Data stock-catalogue funnel. No prices or investment scores.
const known = [
  ["XNAS","US","NASDAQ"],["XNYS","US","NYSE"],["ARCX","US","NYSE ARCA"],
  ["XTSE","CA","TSX"],["XTKS","JP","JPX"],["XHKG","HK","HKEX"],
  ["XSHG","CN","SSE"],["XSES","SG","SGX"],["XNSE","IN","NSE"],
  ["XASX","AU","ASX"],["BVMF","BR","B3"],["XJSE","ZA","JSE"],
  ["XMIL","IT","MTA"],["XETR","DE","XETR"],["XLON","GB","LSE"],["XPAR","FR","XPAR"],
];
const up=x=>typeof x==="string"?x.trim().toUpperCase():"";
const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
function register(map,key,value){
 if(!key)return;
 if(!map.has(key))map.set(key,value);
 else if(map.get(key)!==value)map.set(key,null);
}
export function screenWorldEquityReferences({stocks,exchanges,world,activeMics,at,limit=2000}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>2000)throw Error("BAD_WORLD_LIMIT");
 if(!Array.isArray(stocks)||!Array.isArray(exchanges)||!Array.isArray(world?.regions)||!(activeMics instanceof Map)||!activeMics.size)throw Error("BAD_WORLD_INPUT");
 const timestamp=Date.parse(at||"");
 if(!Number.isFinite(timestamp)||new Date(timestamp).toISOString()!==at)throw Error("BAD_WORLD_TIMESTAMP");
 const regions=new Map(),names=new Map();
 const display=new Intl.DisplayNames(["en"],{type:"region"});
 for(const r of world.regions){
  for(const c of r.countries){
   regions.set(c,r.id);
   register(names,up(display.of(c)),c);
  }
 }
 for(const {country:code} of activeMics.values()){
  if(!regions.has(code))regions.set(code,"other-markets");
  register(names,up(display.of(code)),code);
 }
 for(const [alias,code] of [["UNITED STATES","US"],["UNITED KINGDOM","GB"],["HONG KONG","HK"],["SOUTH KOREA","KR"],["KOREA","KR"],["TAIWAN","TW"],["VIET NAM","VN"]])register(names,alias,code);
 const country=v=>regions.has(up(v))?up(v):names.get(up(v))||null;
 const venues=new Set();
 const exchangeCodes=new Map();
 for(const [mic,c,alias] of known){
  if(activeMics.get(mic)?.country===c)register(exchangeCodes,alias,mic);
 }
 for(const e of exchanges){
  const mic=up(e?.mic_code||e?.mic||e?.code);
  if(!activeMics.has(mic)||country(e?.country_code||e?.country)!==activeMics.get(mic).country)continue;
  venues.add(mic);
  for(const raw of [e.code,e.name,e.exchange,e.mic_code,e.mic])register(exchangeCodes,up(raw),mic);
 }
 const excluded={nonCommonStock:0,invalidIdentity:0,unknownVenue:0,unknownCountry:0,duplicateOrConflict:0};
 const accepted=new Map(),conflicts=new Set();
 for(const s of stocks){
  if(s?.type!=="Common Stock"){excluded.nonCommonStock++;continue}
  const ticker=up(s.symbol),currency=up(s.currency),name=typeof s.name==="string"?s.name.trim():"";
  if(!/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(ticker)||!/^[A-Z]{3}$/.test(currency)||name.length<2||name.length>140){excluded.invalidIdentity++;continue}
  const direct=up(s.mic_code||s.mic);
  const alias=up(s.exchange||s.exchange_code);
  const mic=direct|| (activeMics.has(alias)?alias:exchangeCodes.get(alias));
  if(!activeMics.has(mic)){excluded.unknownVenue++;continue}
  const issuerCountry=country(s.country_code||s.country);
  if(!issuerCountry){excluded.unknownCountry++;continue}
  const venueCountry=activeMics.get(mic).country;
  venues.add(mic);
  const key=mic+"|"+ticker+"|"+currency;
  if(conflicts.has(key)){excluded.duplicateOrConflict++;continue}
  const row={ticker,name,mic,currency,issuerCountry,venueCountry,region:regions.get(venueCountry),
   referenceObservedAt:at,referenceOnly:true,price:null,liquidity:null,investmentScore:null,
   paperAllowed:false,liveAllowed:false,brokerOrderAllowed:false};
  if(accepted.has(key)){
   excluded.duplicateOrConflict++;
   const prev=accepted.get(key);
   if(prev.name!==name||prev.issuerCountry!==issuerCountry){
    accepted.delete(key);conflicts.add(key);
   }
  }else accepted.set(key,row);
 }
 const all=[...accepted.values()],buckets=new Map([...venues].sort().map(mic=>[mic,[]]));
 for(const item of all){
  buckets.get(item.mic).push(item);
 }
 const queues=[...buckets.values()].filter(rows=>rows.length);
 for(const rows of queues)rows.sort((a,b)=>hash(a.ticker)-hash(b.ticker)||a.ticker.localeCompare(b.ticker)||a.currency.localeCompare(b.currency));
 const first=queues.length?Math.floor(timestamp/86400_000)%queues.length:0;
 let pending=[...queues.slice(first),...queues.slice(0,first)];
 const selected=[],selectedByMic=new Map();
 for(let index=0;pending.length&&selected.length<limit;index++){
  const next=[];
  for(const rows of pending){
   const row=rows[index];
   selected.push(row);
   selectedByMic.set(row.mic,(selectedByMic.get(row.mic)||0)+1);
   if(rows.length>index+1)next.push(rows);
   if(selected.length===limit)break;
  }
  pending=next;
 }
 const byRegion={};
 const byVenue={};
 for(const [mic,rows] of buckets){
  const {country,operatingMic}=activeMics.get(mic);
  const region=regions.get(country), total=rows.length, count=selectedByMic.get(mic)||0;
  byVenue[mic]={country,region,operatingMic,total,selected:count};
  byRegion[region]??={total:0,selected:0};
  byRegion[region].total+=total;
  byRegion[region].selected+=count;
 }
 return {
  summary:{version:2,generatedAt:at,status:"REFERENCE_SCREEN_ONLY",
   read:stocks.length,common:stocks.length-excluded.nonCommonStock,
   accepted:all.length,selected:selected.length,limit,
   countries:new Set(selected.map(s=>s.venueCountry)).size,
   regions:new Set(selected.map(s=>s.region)).size,
   excluded,byRegion,byVenue,source:"twelve-data-stock-reference",
   safety:{researchOnly:true,paperAllowed:false,liveAllowed:false,brokerOrderAllowed:false,changesPaperV6:false}},
  selected,
 };
}
