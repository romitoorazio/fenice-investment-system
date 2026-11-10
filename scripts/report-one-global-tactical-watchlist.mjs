import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {worldTacticalResearchRadar} from "../lib/intelligence/one-global-tactical-watchlist.mjs";
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const terminal=JSON.parse(readFileSync(resolve(ROOT,"data","terminal-intelligence.json"),"utf8"));
const result=worldTacticalResearchRadar({terminal,nowIso:new Date().toISOString()});
const output=process.argv.find(x=>x.startsWith("--output="))?.slice(9)
  ||"/tmp/fenice-world-tactical-research.json";
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify(result,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({
 mode:result.mode,stale:result.staleSnapshot,
 considered:result.universeReviewed,eligible:result.equityResearchRows,
 nonUS:result.globalRows,watchlist:result.balancedGlobalWatchlist.length,
 paperFills:result.policy.phase9CertificationCredit,
 directOrdersEnabled:result.policy.liveTradingAllowed,
}));
