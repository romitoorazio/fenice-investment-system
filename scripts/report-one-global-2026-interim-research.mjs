import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {validateOfficial2026InterimFacts}
 from "../lib/intelligence/one-global-2026-interim-research.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>JSON.parse(readFileSync(resolve(root,"data",name),"utf8"));
const current=read("one-global-2026-interim-primary-releases.json");
const annual=read("one-global-fy2025-official-issuer-releases.json");
const report=validateOfficial2026InterimFacts({
 data:current,fy2025:annual,nowIso:new Date().toISOString(),
});
const output=process.argv.find(x=>x.startsWith("--output="))?.slice(9)
 ||"/tmp/fenice-one-global-2026-interim-research.json";
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({
 mode:report.mode,issuers:report.count,metrics:report.metricCount,
 sources:report.rows.map(x=>({key:x.key,release:x.releaseDate,
  metrics:x.metricCount,refreshDue:x.refreshDue})),
 buySignals:0,verifiedExecutableQuotes:0,
 phase9Credit:0,paperOrders:0,liveOrders:0,
}));
