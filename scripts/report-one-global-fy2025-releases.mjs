import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {assessPinnedIssuer2025Results} from "../lib/intelligence/one-global-fy2025-release-audit.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const file=resolve(root,"data/one-global-fy2025-official-issuer-releases.json");
const source=JSON.parse(readFileSync(file,"utf8"));
const report=assessPinnedIssuer2025Results({data:source,nowIso:new Date().toISOString()});
const output=process.argv.find(x=>x.startsWith("--output="))?.slice(9)
 ||"/tmp/fenice-one-global-fy2025-issuer-release-research.json";
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({
 mode:report.mode,count:report.count,metrics:report.metricsCount,
 items:report.companies.map(x=>({
  key:x.key,period:x.fiscalPeriodEnd,
  publication:x.sourcePublishedAt,ageDays:x.annualPeriodAgeDays,
  issuerReleasesOnly:true,statementReconciled:false,
 })),
 actionableBuySignals:0,phase9Credit:0,
 liveTradingAllowed:false,brokerConnectivityAllowed:false,
}));
