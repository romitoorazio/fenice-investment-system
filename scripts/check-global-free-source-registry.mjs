/** Non-executing research registry: never imports a broker or requests a quote. */
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const file=new URL("../data/global-free-source-registry.json",import.meta.url);
export function assessFreeSourceRegistry(registry){
  const errors=[];
  if(registry.mode!=="RESEARCH_ONLY"||registry.costAuthorizedEuro!==0)errors.push("RESEARCH_OR_COST_POLICY");
  for(const key of ["brokerConnectivityAllowed","liveTradingAllowed","automatedIngestionEnabled","certificationCredit","independentRealtimeQuorumSatisfied"])
    if(registry.policy?.[key]!==false)errors.push("UNSAFE_POLICY_"+key);
  const seen=new Set();
  for(const s of registry.sources||[]){
    if(seen.has(s.id))errors.push("DUPLICATE_SOURCE_ID");
    seen.add(s.id);
    if(!["DE","IT","JP"].includes(s.country))errors.push("UNEXPECTED_COUNTRY");
    if(!s.publicDocs?.startsWith("https://"))errors.push("MISSING_OFFICIAL_DOCS");
    if(s.licenceForAutomatedPaperVerified!==false||s.secondIndependentProviderVerified!==false)
      errors.push("UNSUPPORTED_PAPER_ELIGIBILITY");
    if(s.state==="PAPER_ELIGIBLE")errors.push("FALSE_PAPER_CERTIFICATION");
  }
  return {valid:errors.length===0,errors,sourceCount:registry.sources?.length||0,
    markets:[...new Set((registry.sources||[]).map(x=>x.country))],
    paperEligibleSources:0,canSubmitPaperOrders:false,canSubmitBrokerOrders:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const registry=JSON.parse(readFileSync(file,"utf8"));
 const result=assessFreeSourceRegistry(registry);
 console.log(JSON.stringify(result,null,2));
 if(!result.valid)process.exitCode=2;
}
