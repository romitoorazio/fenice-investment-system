/**
 * Run only after Terminal produced a NEW daily research snapshot.
 * This writer never queries vendors, opens broker connections, mutates PAPER
 * ledgers or counts technical V8 results as investment performance.
 */
import {readFileSync,writeFileSync,renameSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {advanceWorldForwardResearchLedger} from "../lib/trading/one-global-forward-research.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const data=resolve(root,"data");
const sourceName=resolve(data,"terminal-intelligence.json");
const ledgerName=resolve(data,"one-global-forward-research-ledger.json");
const read=path=>JSON.parse(readFileSync(path,"utf8"));
const previous=read(ledgerName);
const terminal=read(sourceName);
const result=advanceWorldForwardResearchLedger({
  terminal,nowIso:new Date().toISOString(),previousLedger:previous,
});
if(result.newObservations>0){
  const tmp=ledgerName+".tmp";
  writeFileSync(tmp,JSON.stringify(result.ledger,null,2)+"\n",{mode:0o600});
  renameSync(tmp,ledgerName);
}
console.log(JSON.stringify({
  mode:result.ledger.mode,
  newObservations:result.newObservations,newResearchSetups:result.newSetups,
  complete2BarOutcomes:result.performance.shortOutcomesMeasured,
  positiveResearchOutcomes:result.performance.shortPositive,
  negativeResearchOutcomes:result.performance.shortNegative,
  blocked:result.blocked,phase9Credit:0,live:false,broker:false,
}));
