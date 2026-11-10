import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {summarizeWorldForwardResearchLedger} from "../lib/trading/one-global-forward-research.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const data=JSON.parse(readFileSync(resolve(root,"data/one-global-forward-research-ledger.json"),"utf8"));
const report=summarizeWorldForwardResearchLedger(data);
const safe={
  mode:data.mode,startedAt:data.startedAt,generatedAt:new Date().toISOString(),
  source:"IMMUTABLE_PROSPECTIVE_TERMINAL_RESEARCH_ONLY",
  ...report,
  policy:{researchOnly:true,usesDailyBarBucketsNotLastTrades:true,
    sampledPriceChangeNotTradePnl:true,feesAndFxExcluded:true,
    paperFills:0,phase9CertificationCredit:0,brokerConnectivityAllowed:false,
    liveTradingAllowed:false},
};
const out=process.argv.find(x=>x.startsWith("--output="))?.slice(9)
  ||"/tmp/fenice-world-forward-research-results.json";
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify(safe,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({mode:safe.mode,setups:safe.setups,
  measurements:safe.shortOutcomesMeasured,gains:safe.shortPositive,
  losses:safe.shortNegative,phase9Credit:0,broker:false}));
