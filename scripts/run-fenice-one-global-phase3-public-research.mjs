/** Phase 3 public-data research run. No credentials, orders, ledger or broker access. */
import {writeFile,mkdir,rename} from "node:fs/promises";
import {simulatePhase5Portfolio} from "../lib/global/phase5-virtual-portfolio.mjs";
import {appendPhase5VirtualLedger} from "../lib/global/phase5-virtual-ledger.mjs";
import {appendPhase4Signals} from "../lib/global/phase4-signal-journal.mjs";
import {persistPhase4SignalJournal} from "../lib/global/phase4-journal-file.mjs";
import {buildPhase4ResearchEvaluation} from "../lib/global/phase4-evaluation.mjs";
import {buildPhase4HistoricalWalkForward} from "../lib/global/phase4-historical-walkforward.mjs";
import {readFile} from "node:fs/promises";
import {fetchPhase3YahooChartHistory} from "../lib/global/phase3-yahoo-history-fetch.mjs";
import {buildPhase3UnattestedWatchlist} from "../lib/global/phase3-unattested-watchlist.mjs";
const symbols=[
 {symbol:"7203.T",mic:"XTKS",instrumentId:"XTKS:7203"},
 {symbol:"0700.HK",mic:"XHKG",instrumentId:"XHKG:0700"},
 {symbol:"RELIANCE.NS",mic:"XNSE",instrumentId:"XNSE:RELIANCE"},
 {symbol:"ENI.MI",mic:"XMIL",instrumentId:"XMIL:ENI"},
 {symbol:"SAP.DE",mic:"XETR",instrumentId:"XETR:SAP"},
 {symbol:"SHEL.L",mic:"XLON",instrumentId:"XLON:SHEL"},
 {symbol:"MSFT",mic:"XNAS",instrumentId:"XNAS:MSFT"},
 {symbol:"JPM",mic:"XNYS",instrumentId:"XNYS:JPM"}
];
const nowIso=new Date().toISOString();
const fetched=await fetchPhase3YahooChartHistory({symbols,nowIso});
const watchlist=buildPhase3UnattestedWatchlist({histories:fetched.histories,nowIso});
const coverage={requestedVenues:[...new Set(symbols.map(x=>x.mic))],receivedVenues:[...new Set(fetched.histories.map(x=>x.mic))],rankedVenues:[...new Set(watchlist.candidates.map(x=>x.mic))]};
const acquisitionStatus=fetched.histories.length===0?"NO_DATA":fetched.histories.length<symbols.length?"PARTIAL":"COMPLETE";
if(process.env.FENICE_PHASE4_JOURNAL_PATH&&acquisitionStatus!=="COMPLETE")throw Error(`PHASE4_GLOBAL_COLLECTION_INCOMPLETE:${fetched.histories.length}/${symbols.length}`);
const report={schemaVersion:1,generatedAt:nowIso,mode:"PUBLIC_UNATTESTED_WORLD_RESEARCH",acquisitionStatus,coverage,source:"Yahoo Finance public chart HTTP; no independent attestation",requestedSymbols:symbols.length,receivedHistories:fetched.histories.length,fetchErrors:fetched.errors,watchlist,realPaperCertified:false,liveTradingAllowed:false,ordersGenerated:0};
if(process.env.FENICE_PHASE4_JOURNAL_PATH&&watchlist.candidates.length!==symbols.length)throw Error(`PHASE4_GLOBAL_SIGNALS_INCOMPLETE:${watchlist.candidates.length}/${symbols.length}`);
const journal=appendPhase4Signals({candidates:watchlist.candidates,capturedAt:nowIso});
await mkdir("artifacts/phase4",{recursive:true});
const historical=buildPhase4HistoricalWalkForward({histories:fetched.histories});
await writeFile("artifacts/phase4/historical-walkforward.json",JSON.stringify(historical,null,2)+"\n");
console.log(JSON.stringify({phase4Historical:"OBSERVED_CLOSES_BACKTEST_NOT_LIVE",results:historical.results,ordersGenerated:0}));
await writeFile("artifacts/phase4/signal-snapshot.json",JSON.stringify({schemaVersion:1,generatedAt:nowIso,mode:"PHASE4_RUN_SNAPSHOT_NOT_PERSISTENT",journal:journal.journal,headHash:journal.headHash,ordersGenerated:0},null,2)+"\n");
if(process.env.FENICE_PHASE4_JOURNAL_PATH){
 const path=process.env.FENICE_PHASE4_JOURNAL_PATH;
 const persisted=await persistPhase4SignalJournal({path,candidates:watchlist.candidates,capturedAt:nowIso});
 const saved=JSON.parse(await readFile(path,"utf8"));
 const evaluation=buildPhase4ResearchEvaluation({journal:saved.journal,histories:fetched.histories,nowIso});
 await writeFile("artifacts/phase4/forward-evaluation.json",JSON.stringify({persisted,evaluation},null,2)+"\n");
 console.log(JSON.stringify({phase4:"PERSISTED_FORWARD_RESEARCH",entries:persisted.total,appended:persisted.appended,duplicates:persisted.duplicates,observed:evaluation.summary.stats.map(x=>({sessions:x.sessions,observed:x.observed,wins:x.wins,losses:x.losses,pending:x.pending})),ordersGenerated:0}));
}
// Phase 5 historical simulation is explicitly not a forward PAPER fill.
const phase5=simulatePhase5Portfolio({histories:fetched.histories,mode:"HISTORICAL_BACKTEST"});
await mkdir("artifacts/phase5",{recursive:true});
await writeFile("artifacts/phase5/latest-historical-portfolio.json",JSON.stringify(phase5,null,2)+"\\n");
if(process.env.FENICE_PHASE5_LEDGER_PATH){
 const path=process.env.FENICE_PHASE5_LEDGER_PATH;
 let existing=[];
 try{existing=JSON.parse(await readFile(path,"utf8")).journal;}catch(e){if(e.code!=="ENOENT")throw e;}
 const ledger=appendPhase5VirtualLedger({journal:existing,trades:phase5.trades,recordedAt:nowIso});
 await mkdir(path.slice(0,path.lastIndexOf("/"))||".",{recursive:true});
 await writeFile(path+".tmp",JSON.stringify({schemaVersion:1,...ledger},null,2)+"\\n");
 await rename(path+".tmp",path);
 console.log(JSON.stringify({phase5:"HISTORICAL_ONLY",trades:phase5.trades.length,appended:ledger.appended,duplicates:ledger.duplicates,ordersGenerated:0}));
}
await mkdir("artifacts/phase3",{recursive:true});
await writeFile("artifacts/phase3/world-research-watchlist.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({status:acquisitionStatus,requested:report.requestedSymbols,received:report.receivedHistories,ranked:watchlist.candidates.length,fetchErrors:fetched.errors.length,rejected:watchlist.rejected.length,realPaperCertified:false,ordersGenerated:0}));
