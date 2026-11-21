/** Phase 3: normalize externally supplied research metrics without upgrading provenance. */
import {getVenue} from "./venue-registry.mjs";
export function normalizePhase3ResearchObservations({observations=[],nowIso=new Date().toISOString(),maxAgeMs=86400000}={}){
 if(!Array.isArray(observations)||!Number.isFinite(Date.parse(nowIso))||!Number.isFinite(maxAgeMs)||maxAgeMs<=0)throw Error("INVALID_RESEARCH_INGESTION_POLICY");
 const accepted=[],rejected=[],now=Date.parse(nowIso);
 for(const [index,o] of observations.entries()){
  const fail=reason=>rejected.push({index,reason});
  if(!o||typeof o!=="object"||!getVenue(o.mic)||typeof o.instrumentId!=="string"||!o.instrumentId.startsWith(o.mic+":")){fail("INVALID_VENUE_OR_INSTRUMENT");continue;}
  const time=Date.parse(o.observedAt??"");
  if(!Number.isFinite(time)||time>now||now-time>maxAgeMs){fail("STALE_OR_FUTURE_OBSERVATION");continue;}
  if(o.synthetic!==true&&!(o.provenanceVerified===true&&typeof o.sourceId==="string"&&o.sourceId.trim()&&typeof o.sourceUrl==="string"&&/^https:\/\//.test(o.sourceUrl))){fail("SOURCE_PROVENANCE_UNVERIFIED");continue;}
  if(o.synthetic===true&&o.provenanceVerified===true){fail("SYNTHETIC_PROVENANCE_CONFLICT");continue;}
  const numbers=["lastPrice","fxToEur","momentum5dPct","momentum20dPct","volatility20dPct","spreadPct"];
  if(numbers.some(k=>typeof o[k]!=="number"||!Number.isFinite(o[k]))||o.lastPrice<=0||o.fxToEur<=0||o.volatility20dPct<=0||o.spreadPct<0){fail("INVALID_NUMERIC_RESEARCH_METRICS");continue;}
  accepted.push({mic:o.mic,instrumentId:o.instrumentId,observedAt:o.observedAt,lastPrice:o.lastPrice,fxToEur:o.fxToEur,momentum5dPct:o.momentum5dPct,momentum20dPct:o.momentum20dPct,volatility20dPct:o.volatility20dPct,spreadPct:o.spreadPct,stopDistancePct:o.stopDistancePct,synthetic:o.synthetic===true,provenanceVerified:o.synthetic===true?false:true,sourceId:o.sourceId??null,sourceUrl:o.sourceUrl??null,classification:o.synthetic===true?"SYNTHETIC_RESEARCH_ONLY":"SOURCE_DECLARED_RESEARCH_ONLY"});
 }
 return {mode:"RESEARCH_INGESTION_ONLY",paperFillAuthorized:false,liveTradingAllowed:false,accepted,rejected};
}
