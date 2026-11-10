/** Mandatory opt-in read boundary for ONE GLOBAL virtual PAPER research.
 * Never turns provider HTTP responses into independently verified executable quotes.
 */
import {readPairedEvidence} from "./paired-evidence-store.mjs";
export async function loadPairedPaperInputs({directory,nowIso=new Date().toISOString()}) {
  const result=await readPairedEvidence({directory,nowIso});
  if(!result.accepted)return {accepted:false,reason:result.reason,certificationCredit:0};
  const {fx,quotes,runId}=result;
  if(fx.provenanceVerified!==true || !fx.ratesToEuro || typeof fx.ratesToEuro!=="object")
    return {accepted:false,reason:"PAPER_FX_PROVENANCE_MISSING",certificationCredit:0};
  if(!Array.isArray(quotes.observations))
    return {accepted:false,reason:"PAPER_QUOTES_INVALID",certificationCredit:0};
  // This endpoint's last/close data cannot establish independently sourced executable bid/ask.
  // Keep research visibility while preventing any synthetic/HTTP evidence promotion.
  const executable=quotes.observations.filter(item=>
    item?.verificationStatus==="INDEPENDENTLY_VERIFIED_EXECUTABLE_BID_ASK" &&
    item?.executableBidAsk===true && item?.provenanceVerified===true &&
    item?.sourceFamily && Number.isFinite(Number(item.bid)) && Number.isFinite(Number(item.ask)) &&
    Number(item.bid)>0 && Number(item.ask)>=Number(item.bid)
  );
  const independent=new Map();
  for(const item of executable){
    const symbol=String(item.symbol||"").trim().toUpperCase();
    if(!symbol)continue;
    if(!independent.has(symbol))independent.set(symbol,new Set());
    independent.get(symbol).add(item.sourceFamily);
  }
  const qualifiedSymbols=[...independent].filter(([,families])=>families.size>=2).map(([symbol])=>symbol);
  if(qualifiedSymbols.length===0)return {accepted:false,reason:"PAPER_INDEPENDENT_EXECUTABLE_QUORUM_MISSING",runId,certificationCredit:0,researchObservations:quotes.observations.length};
  // Venue session/calendar and per-fill FX checks must still be independently attested downstream.
  return {accepted:false,reason:"PAPER_VENUE_AND_FILL_ATTESTATION_REQUIRED",runId,qualifiedSymbols,certificationCredit:0};
}
