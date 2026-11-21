/** Phase 3 read-only report: sourced observations remain research, never trading instructions. */
import {normalizePhase3ResearchObservations} from "./phase3-research-ingestion.mjs";
import {buildPhase3ResearchPortfolio} from "./phase3-research-portfolio.mjs";
export function generatePhase3GlobalResearchReport({observations=[],capitalEur,nowIso=new Date().toISOString(),perPositionRiskPct=1,maxAllocationPct=10,maxPortfolioAllocationPct=40,maxPortfolioRiskPct=4,estimatedRoundTripFeesEur=0}={}){
 const ingestion=normalizePhase3ResearchObservations({observations,nowIso});
 const portfolio=buildPhase3ResearchPortfolio({candidates:ingestion.accepted,capitalEur,perPositionRiskPct,maxAllocationPct,maxPortfolioAllocationPct,maxPortfolioRiskPct,estimatedRoundTripFeesEur,nowIso});
 const byVenue={};
 for(const item of ingestion.accepted){
  if(!Object.hasOwn(byVenue,item.mic))byVenue[item.mic]={observations:0,synthetic:0,sourceDeclared:0};
  byVenue[item.mic].observations++;
  if(item.synthetic)byVenue[item.mic].synthetic++;else byVenue[item.mic].sourceDeclared++;
 }
 return {schemaVersion:1,mode:"PHASE3_GLOBAL_RESEARCH_REPORT",generatedAt:nowIso,realPaperCertified:false,liveTradingAllowed:false,ordersGenerated:0,sourceVerification:"DECLARED_NOT_INDEPENDENTLY_ATTESTED",coverage:byVenue,acceptedObservations:ingestion.accepted.length,rejectedObservations:ingestion.rejected,portfolio};
}
