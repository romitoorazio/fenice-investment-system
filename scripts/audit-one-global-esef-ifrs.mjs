import {writeFileSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {auditEuropeanXbrlFacts} from "../lib/intelligence/one-global-esef-ifrs-audit.mjs";

const result=await auditEuropeanXbrlFacts({nowIso:new Date().toISOString()});
const out=process.argv.find(x=>x.startsWith("--output="))?.slice(9)
  ||"/tmp/fenice-one-global-ifrs-research-audit.json";
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify(result,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({
  mode:result.mode,discoveredIssuers:result.discoveredIssuers,
  parsedIssuers:result.parsedIssuers,
  rows:result.rows.map(x=>({key:x.key,state:x.state,
    periodEnd:x.periodEnd,sourceAgeDays:x.sourceAgeDays,
    researchCompleteness:x.researchCompleteness,
    verifiedMetricKeys:x.metrics?Object.entries(x.metrics).filter(([,v])=>v!==null)
      .map(([k])=>k):[],
    missingMetricKeys:x.metrics?Object.entries(x.metrics).filter(([,v])=>v===null)
      .map(([k])=>k):[],
    balanceSheetReconciled:x.balanceSheetReconciliation?.passed||false,
    issuerFundamentalScoreEligible:false,
    strategyPaperEligible:false})),
  errors:result.errors,
  officialAnnualSourceGaps:result.officialAnnualSourceGaps?.map(x=>({key:x.key,
    indexedPeriodEnd:x.latestIndexedPeriodEnd,officialAnnualPeriodEnd:x.officialAnnualPeriodEnd,
    nextAction:x.nextAction,financialFactsReconciled:false}))??[],
  committeeScoresModified:false,phase9Credit:0,brokerOrdersAllowed:false,
}));
