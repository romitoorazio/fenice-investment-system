import {buildOneGlobalPublicTacticalView} from './one-global-world-radar.mjs';
import {buildWorldMarketDataHealth} from './world-market-data-health.mjs';
const ROOT='https://raw.githubusercontent.com/romitoorazio/fenice-investment-system/main/data/';
const FILES=['terminal-intelligence.json','one-global-forward-research-ledger.json',
  'global-source-health.json','world-v7-eod-research.json'];
/** Fixed public read-only inputs, bounded bodies, validated hash chain. */
export async function readLatestWorldTacticalEvidence({fallback,nowIso,fetcher=fetch}){
  const project=(data,source)=>({
    radar:buildOneGlobalPublicTacticalView({terminal:data.terminal,ledger:data.ledger,nowIso}),
    dataHealth:buildWorldMarketDataHealth({...data,master:fallback.master,seeds:fallback.seeds,nowIso}),source,
  });
  try{
    const payloads=await Promise.all(FILES.map(async name=>{
      const response=await fetcher(ROOT+name,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(3500)});
      if(!response.ok)throw Error('WORLD_RADAR_SOURCE_UNAVAILABLE');
      const length=Number(response.headers.get('content-length'));
      if(Number.isFinite(length)&&length>3000000)throw Error('WORLD_RADAR_SOURCE_TOO_LARGE');
      const raw=await response.text();
      if(Buffer.byteLength(raw)>3000000)throw Error('WORLD_RADAR_SOURCE_TOO_LARGE');
      return JSON.parse(raw);
    }));
    return project({terminal:payloads[0],ledger:payloads[1],health:payloads[2],eod:payloads[3]},
      'Ultimo GitHub main (verificato)');
  }catch{
    try{return project(fallback,'Snapshot incluso nel sito; aggiornamento GitHub non raggiungibile');}
    catch{return {radar:null,dataHealth:null,source:'Dati non verificabili: radar sospeso'};}
  }
}
