/**
 * Source-safe ONE GLOBAL EOD onboarding report.
 * Public research metadata contains neither licensed closes nor owner rights:
 * never infer price entitlement, private PAPER approval or execution fills.
 */
import {readFileSync,writeFileSync,appendFileSync} from "node:fs";
import {newOneGlobalEodPaperLedger,summarizeOneGlobalEodPaper} from "../lib/trading/one-global-eod-paper.mjs";
const venues=["XMIL","XETR","XTKS"];
const allowedStatuses=new Set(["COMPLETE_EOD_RESEARCH","TENTATIVE_COMPLETED_DAILY_RESEARCH"]);
const nonBlank=x=>typeof x==="string"&&x.trim().length>0;
export function buildWorldEodPaperReadiness({eod,nowIso}){
  const date=Date.parse(nowIso),generated=Date.parse(eod?.generatedAt||"");
  if(!Number.isFinite(date)||!Number.isFinite(generated)||date<generated||
    eod?.mode!=="WORLD_V7_EOD_RESEARCH_ONLY"||
    eod?.liveTradingAllowed!==false||eod?.realtimePaperEligible!==false)
    throw Error("EOD_READINESS_SOURCE_INVALID");
  const ageHours=(date-generated)/3600000;
  const researchStale=ageHours>24;
  const rows=venues.map(mic=>{
    const x=eod.records?.[mic],status=nonBlank(x?.status)?x.status:"NO_SOURCE_DATA";
    const blockers=[];
    if(!allowedStatuses.has(status))blockers.push("NO_USABLE_COMPLETED_DAILY_RESEARCH");
    if(researchStale)blockers.push("EOD_RESEARCH_SNAPSHOT_STALE");
    if(x?.providerSymbolConfirmed!==true)blockers.push("EXACT_PROVIDER_SYMBOL_MAPPING_UNCONFIRMED");
    if(x?.exactMicCertified!==true)blockers.push("EXACT_EXCHANGE_MIC_UNVERIFIED");
    if(x?.licensedPaperSource!==true)blockers.push("PERSONAL_PAPER_DATA_RIGHTS_UNVERIFIED");
    blockers.push("SECOND_INDEPENDENT_COMPLETED_CLOSE_MISSING");
    blockers.push("EXPLICIT_PRIVATE_EOD_SIMULATION_APPROVAL_REQUIRED");
    return {mic,status,lastCompleteBarDate:x?.lastCompleteBarDate||null,
      providerSymbolMatched:x?.providerSymbolConfirmed===true,
      blockers,availableAsResearchOnly:allowedStatuses.has(status)&&!researchStale,
      virtualFillsCertified:0,phase9Credit:0};
  });
  return {version:1,generatedAt:nowIso,
    mode:"ONE_GLOBAL_EOD_PRIVATE_PAPER_READINESS_ONLY",
    inputResearchGeneratedAt:eod.generatedAt,
    inputResearchAgeHours:Math.round(ageHours*100)/100,
    observation:rows,venuesSupportedByPrivateEngine:[
      "XMIL","XETR","XPAR","XLON","XSWX","XTKS","XHKG","XASX","XNYS","XNAS","XJSE","XSES"],
    initialVirtualCapitalEuro:1000,maxPositionEuro:50,
    settlementModel:"NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT",
    privateLedger:summarizeOneGlobalEodPaper(newOneGlobalEodPaperLedger()),
    privatePricesStoredInPublicRepository:false,
    autoPaperExecutionEnabled:false,liveTradingAllowed:false,brokerConnectivityAllowed:false,
    noOwnerApprovalInRepository:true,sourceEntitlementIndependentlyCertified:false,
    certifiedForwardTrades:0,phase9Credit:0,
  };
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
  const file="data/world-v7-eod-research.json";
  const report=buildWorldEodPaperReadiness({
    eod:JSON.parse(readFileSync(file,"utf8")),nowIso:new Date().toISOString()});
  const output=process.argv.find(x=>x.startsWith("--output="))?.slice(9);
  if(output)writeFileSync(output,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({
    mode:report.mode,venues:report.observation.map(o=>({
      mic:o.mic,status:o.status,blockers:o.blockers,
    })),certifiedForwardTrades:0,sourceEntitlementIndependentlyCertified:false,
    privatePaperWriterNotActivated:true,noMarketPricesDisclosed:true,
  }));
  if(process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "## ONE GLOBAL: EOD private PAPER pilot\n\n"+
      report.observation.map(o=>"- "+o.mic+": "+o.status+" — "+o.blockers.join(", ")).join("\n")+
      "\n\nNo public private evidence, no PAPER certification or Directa LIVE orders.\n");
}
