/** Deterministic FX evidence consensus; no network calls, broker access, or guessed rates. */
export function evaluateFxConsensus({base,observations,nowIso,maxAgeMs=120000,maxDeviationBps=100}){
  const now=Date.parse(nowIso);
  if(!Number.isFinite(now)||typeof base!=="string"||!/^[A-Z]{3}$/.test(base)||!Number.isFinite(maxAgeMs)||maxAgeMs<0||!Number.isFinite(maxDeviationBps)||maxDeviationBps<0)return {allowed:false,reason:"INVALID_FX_POLICY"};
  if(base==="EUR")return {allowed:true,reason:null,rate:1,families:0};
  if(!Array.isArray(observations))return {allowed:false,reason:"FX_OBSERVATIONS_MISSING"};
  const families=new Map();
  for(const q of observations){
    const at=Date.parse(q?.observedAt??"");
    if(q?.base!==base||q?.quote!=="EUR"||typeof q?.family!=="string"||!q.family.trim()||!Number.isFinite(q.rate)||q.rate<=0||!Number.isFinite(at)||at>now||now-at>maxAgeMs)continue;
    const family=q.family.trim().toLowerCase();
    if(families.has(family))return {allowed:false,reason:"FX_DUPLICATE_FAMILY"};
    families.set(family,q.rate);
  }
  if(families.size<2)return {allowed:false,reason:"FX_INDEPENDENT_SOURCES_MISSING"};
  const rates=[...families.values()],min=Math.min(...rates),max=Math.max(...rates);
  if(!Number.isFinite((max-min)/min*10000)||(max-min)/min*10000>maxDeviationBps)return {allowed:false,reason:"FX_PROVIDER_DISAGREEMENT"};
  return {allowed:true,reason:null,rate:rates.reduce((a,b)=>a+b,0)/rates.length,families:families.size};
}
