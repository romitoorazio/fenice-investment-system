// Public research display only. Never used by PAPER execution, broker writes,
// source entitlements, risk gates, or the private original Vercel Blob ledger.
const URL='https://raw.githubusercontent.com/romitoorazio/fenice-investment-system/main/data/latest-snapshot.json';
const MAX_BYTES=3_000_000;
const MAX_FUTURE_MS=5*60*1000;

function validIsoDate(value){
  if(typeof value!=='string')return false;
  const date=new Date(value);
  return Number.isFinite(date.getTime())&&date.toISOString()===value;
}

export function validPublicMissionSnapshot(value){
  return Boolean(value&&typeof value==='object'&&!Array.isArray(value)
    &&validIsoDate(value.generatedAt)
    &&['live','partial','bootstrap'].includes(value.mode)
    &&typeof value.headline==='string'
    &&value.pulse&&typeof value.pulse==='object'
    &&Number.isFinite(value.pulse.opportunity)&&Number.isFinite(value.pulse.risk)
    &&Array.isArray(value.markets)&&Array.isArray(value.providers)
    &&Array.isArray(value.macro)&&Array.isArray(value.discoveries)
    &&Array.isArray(value.warnings)
    &&value.markets.every(row=>row&&typeof row.symbol==='string'
      &&typeof row.name==='string'&&typeof row.assetClass==='string'
      &&typeof row.source==='string'&&Number.isFinite(row.score)
      &&Number.isFinite(row.risk))
    &&value.providers.every(row=>row&&typeof row.id==='string'
      &&typeof row.name==='string'&&typeof row.state==='string'));
}

/** Use newer public GitHub research without waiting for a code deployment.
 * A malformed, unavailable, older or future-dated source fails back to the
 * packaged snapshot. Never elevate this public research to PAPER eligibility.
 */
export async function readLatestPublicMissionSnapshot({
  fallback,fetcher=fetch,nowMs=Date.now()
}={}){
  const bundled={snapshot:fallback,source:'BUNDLED'};
  try{
    if(!Number.isFinite(nowMs))return bundled;
    const response=await fetcher(URL,{
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(3500),
    });
    if(!response?.ok)return bundled;
    const header=Number(response.headers?.get('content-length')||0);
    if(!Number.isFinite(header)||header<0||header>MAX_BYTES)return bundled;
    const raw=await response.text();
    if(Buffer.byteLength(raw,'utf8')>MAX_BYTES)return bundled;
    const snapshot=JSON.parse(raw);
    if(!validPublicMissionSnapshot(snapshot))return bundled;
    const liveMs=Date.parse(snapshot.generatedAt);
    const bundledMs=Date.parse(fallback?.generatedAt||'');
    if(liveMs>nowMs+MAX_FUTURE_MS
      ||Number.isFinite(bundledMs)&&liveMs<bundledMs)return bundled;
    return {snapshot,source:'GITHUB_MAIN_PUBLIC'};
  }catch{
    return bundled;
  }
}
