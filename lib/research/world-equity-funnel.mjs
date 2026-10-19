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
export function screenWorldEquityReferences({stocks,exchanges,world,europe,at,limit=2000}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>2000)throw Error("BAD_WORLD_LIMIT");
 if(!Array.isArray(stocks)||!Array.isArray(exchanges)||!Array.isArray(world?.regions)||!Array.isArray(europe?.markets))throw Error("BAD_WORLD_INPUT");
 const timestamp=Date.parse(at||"");
 if(!Number.isFinite(timestamp)||new Date(timestamp).toISOString()!==at)throw Error("BAD_WORLD_TIMESTAMP");
 const regions=new Map(),names=new Map();
 const display=new Intl.DisplayNames(["en"],{type:"region"});
 for(const r of world.regions){
  if(!["europe","asia-pacific","north-america","latin-america-caribbean","middle-east-africa"].includes(r.id))continue;
  for(const c of r.countries){
   regions.set(c,r.id);
   register(names,up(display.of(c)),c);
  }
 }
 for(const [alias,code] of [["UNITED STATES","US"],["UNITED KINGDOM","GB"],["HONG KONG","HK"],["SOUTH KOREA","KR"],["TAIWAN","TW"],["BRAZIL","BR"]]){
  if(regions.has(code))register(names,alias,code);
 }
 const country=v=>regions.has(up(v))?up(v):names.get(up(v))||null;
 const venues=new Map();
 for(const [mic,c,alias] of known)if(regions.has(c))venues.set(mic,{country:c,alias});
 for(const e of europe.markets){
  if(!/^[A-Z0-9]{4}$/.test(e.mic)||!regions.has(e.country))continue;
  if(venues.has(e.mic)&&venues.get(e.mic).country!==e.country)throw Error("WORLD_VENUE_CONFLICT");
  if(!venues.has(e.mic))venues.set(e.mic,{country:e.country,alias:null});
 }
 const exchangeCodes=new Map();
 for(const [mic,v] of venues){
  register(exchangeCodes,mic,mic);
  if(v.alias)register(exchangeCodes,v.alias,mic);
 }
 for(const e of exchanges){
  const mic=up(e?.mic_code||e?.mic);
  if(!venues.has(mic)||country(e?.country_code||e?.country)!==venues.get(mic).country)continue;
  for(const raw of [e.code,e.exchange,e.mic_code,e.mic])register(exchangeCodes,up(raw),mic);
 }
 const excluded={nonCommonStock:0,invalidIdentity:0,unknownVenue:0,unknownCountry:0,duplicateOrConflict:0};
 const accepted=new Map(),conflicts=new Set();
 for(const s of stocks){
  if(s?.type!=="Common Stock"){excluded.nonCommonStock++;continue}
  const ticker=up(s.symbol),currency=up(s.currency),name=typeof s.name==="string"?s.name.trim():"";
  if(!/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(ticker)||!/^[A-Z]{3}$/.test(currency)||name.length<2||name.length>140){excluded.invalidIdentity++;continue}
  const direct=up(s.mic_code||s.mic);
  const mic=direct?(venues.has(direct)?direct:null):exchangeCodes.get(up(s.exchange||s.exchange_code))||null;
  if(!mic||!venues.has(mic)){excluded.unknownVenue++;continue}
  const issuerCountry=country(s.country_code||s.country);
  if(!issuerCountry){excluded.unknownCountry++;continue}
  const venueCountry=venues.get(mic).country;
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
 const all=[...accepted.values()],buckets=new Map();
 for(const item of all){
  const key=item.region+"|"+item.venueCountry;
  if(!buckets.has(key))buckets.set(key,[]);
  buckets.get(key).push(item);
 }
 for(const rows of buckets.values())rows.sort((a,b)=>hash(a.mic+a.ticker)-hash(b.mic+b.ticker)||a.ticker.localeCompare(b.ticker));
 const order=["asia-pacific","europe","north-america","latin-america-caribbean","middle-east-africa"];
 const groups=new Map(order.map(r=>[r,[...buckets.keys()].filter(k=>k.startsWith(r+"|")).sort()]));
 const offsets=new Map([...buckets.keys()].map(k=>[k,0])),selected=[];
 for(let rounds=0;selected.length<Math.min(limit,all.length);rounds++){
  let progress=false;
  for(const region of order){
   const group=groups.get(region);
   for(let j=0;j<group.length;j++){
    const k=group.shift();group.push(k);
    const offset=offsets.get(k);
    if(offset>=buckets.get(k).length)continue;
    selected.push(buckets.get(k)[offset]);offsets.set(k,offset+1);progress=true;
    break;
   }
   if(selected.length>=limit)break;
  }
  if(!progress)break;
  if(rounds>limit+5)throw Error("WORLD_SAMPLER_BUDGET");
 }
 const byRegion={};
 for(const r of order)byRegion[r]={total:all.filter(s=>s.region===r).length,selected:selected.filter(s=>s.region===r).length};
 return {
  summary:{version:1,generatedAt:at,status:"REFERENCE_SCREEN_ONLY",
   read:stocks.length,common:stocks.length-excluded.nonCommonStock,
   accepted:all.length,selected:selected.length,limit,
   countries:new Set(selected.map(s=>s.venueCountry)).size,
   regions:new Set(selected.map(s=>s.region)).size,
   excluded,byRegion,source:"twelve-data-stock-reference",
   safety:{researchOnly:true,paperAllowed:false,liveAllowed:false,brokerOrderAllowed:false,changesPaperV6:false}},
  selected,
 };
}
