import {readFile,writeFile} from "node:fs/promises";
import {accumulateV7ProviderContinuity} from "../lib/intelligence/v7-provider-continuity.mjs";
const readArg=(key,fallback)=>{
  const a=process.argv.find(x=>x.startsWith("--"+key+"="));
  return a?a.slice(key.length+3):fallback;
};
const reportPath=readArg("report","data/v7-provider-feasibility.json");
const ledgerPath=readArg("ledger","data/v7-provider-continuity.json");
if(!/^data\/v7-provider-(?:feasibility|continuity)\.json$/.test(reportPath)
  ||ledgerPath!=="data/v7-provider-continuity.json")throw Error("V7_CONTINUITY_INVALID_PATH");
const report=JSON.parse(await readFile(reportPath,"utf8"));
const current=JSON.parse(await readFile(ledgerPath,"utf8"));
const {ledger,admitted,changed}=accumulateV7ProviderContinuity(current,report);
if(changed)await writeFile(ledgerPath,JSON.stringify(ledger,null,2)+"\n","utf8");
console.log(JSON.stringify({mode:"V7_PROVIDER_CONTINUITY_DIAGNOSTIC_ONLY",
 admitted,changed,observedDays:ledger.summary.observedDays,
 daysWithAnyConfirmation:ledger.summary.daysWithAnyDualProviderConfirmation,
 recordedSamples:ledger.summary.totalRecordedSamples,
 certifiedPaperFills:0,contractualRightsVerified:false,liveTradingAllowed:false}));
