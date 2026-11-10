import {mkdirSync,writeFileSync} from "node:fs";
import {dirname} from "node:path";
import {discoverEuropeanFilings} from "../lib/intelligence/one-global-esef-discovery.mjs";
const report=await discoverEuropeanFilings({nowIso:new Date().toISOString()});
const out=process.argv.find(x=>x.startsWith("--output="))?.slice(9)
  ||"/tmp/fenice-eu-official-report-discovery.json";
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({mode:report.mode,source:report.source,found:report.found,
  missing:report.missing,
  rows:report.rows.map(x=>({key:x.key,state:x.state,
    period:x.latestReport?.periodEnd||null})),
  financialFactsReconciled:false,phase9Credit:0,broker:false,live:false}));
