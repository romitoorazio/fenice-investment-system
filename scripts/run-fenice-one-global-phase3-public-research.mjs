/** Phase 3 public-data research run. No credentials, orders, ledger or broker access. */
import {writeFile,mkdir,rename} from "node:fs/promises";
import {simulatePhase5Portfolio} from "../lib/global/phase5-virtual-portfolio.mjs";
import {appendPhase5VirtualLedger,validatePhase5PersistedLedger,reconcilePhase5PortfolioToLedger} from "../lib/global/phase5-virtual-ledger.mjs";
import {appendPhase4Signals} from "../lib/global/phase4-signal-journal.mjs";
import {persistPhase4SignalJournal} from "../lib/global/phase4-journal-file.mjs";
import {buildPhase4ResearchEvaluation} from "../lib/global/phase4-evaluation.mjs";
import {buildPhase4HistoricalWalkForward} from "../lib/global/phase4-historical-walkforward.mjs";
import {readFile} from "node:fs/promises";
import {fetchEcb90DayFxReference} from "../lib/global/ecb-daily-fx-reference.mjs";
import {advancePhase5ForwardResearch} from "../lib/global/phase5-forward-research.mjs";
import {fetchPhase3YahooChartHistory} from "../lib/global/phase3-yahoo-history-fetch.mjs";
import {buildPhase3UnattestedWatchlist,assessPhase3PersistentCoverage} from "../lib/global/phase3-unattested-watchlist.mjs";
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
const coveragePolicy=assessPhase3PersistentCoverage({requested:symbols.length,received:fetched.histories.length,ranked:watchlist.candidates.length});
const report={schemaVersion:1,generatedAt:nowIso,mode:"PUBLIC_UNATTESTED_WORLD_RESEARCH",acquisitionStatus,coverage,coveragePolicy,source:"Yahoo Finance public chart HTTP; no independent attestation",requestedSymbols:symbols.length,receivedHistories:fetched.histories.length,fetchErrors:fetched.errors,watchlist,realPaperCertified:false,liveTradingAllowed:false,ordersGenerated:0};
await mkdir("artifacts/phase3",{recursive:true});
await writeFile("artifacts/phase3/world-research-watchlist.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({phase3Coverage:coveragePolicy,fetchErrors:fetched.errors,rejected:watchlist.rejected}));
if(process.env.FENICE_PHASE4_JOURNAL_PATH&&!coveragePolicy.eligibleForResearchPersistence)throw Error(`PHASE4_GLOBAL_COLLECTION_BELOW_RESEARCH_THRESHOLD:${fetched.histories.length}/${symbols.length};ranked=${watchlist.candidates.length}`);
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
const fxReference=await fetchEcb90DayFxReference({nowIso});
console.log(JSON.stringify({phase5FxHistoricalResearch:fxReference.ok?"ECB_90_DAY_AVAILABLE":fxReference.reason,referenceDays:fxReference.ok?fxReference.days.length:0,countsTowardRealPaper:false}));
const phase5={...simulatePhase5Portfolio({histories:fetched.histories,mode:"HISTORICAL_BACKTEST",asOfIso:nowIso,fxReference}),sourceCoverage:coveragePolicy,missingSourceSymbols:fetched.errors.map(e=>e.symbol??null).filter(Boolean),fxAcquisition:{status:fxReference.ok?"AVAILABLE":"UNAVAILABLE",reason:fxReference.ok?null:fxReference.reason,sourceUrl:fxReference.ok?fxReference.sourceUrl:null,countsTowardRealPaper:false}};
await mkdir("artifacts/phase5",{recursive:true});
let publishedPhase5=phase5;
if(process.env.FENICE_PHASE5_LEDGER_PATH){
 const path=process.env.FENICE_PHASE5_LEDGER_PATH;
 let existing=[];
 try{existing=validatePhase5PersistedLedger(JSON.parse(await readFile(path,"utf8")),nowIso);}catch(e){if(e.code!=="ENOENT")throw e;}
 const ledger=appendPhase5VirtualLedger({journal:existing,trades:phase5.trades,recordedAt:nowIso});
 publishedPhase5=reconcilePhase5PortfolioToLedger({portfolio:phase5,ledger});
 await mkdir(path.slice(0,path.lastIndexOf("/"))||".",{recursive:true});
 await writeFile(path+".tmp",JSON.stringify({schemaVersion:1,...ledger,sourceCoverage:coveragePolicy},null,2)+"\n");
 await rename(path+".tmp",path);
 console.log(JSON.stringify({phase5:"HISTORICAL_ONLY",trades:phase5.trades.length,appended:ledger.appended,duplicates:ledger.duplicates,repricedDuplicateCount:publishedPhase5.reconciliation.repricedDuplicateCount,ordersGenerated:0}));
}
await writeFile("artifacts/phase5/latest-historical-portfolio.json",JSON.stringify(publishedPhase5,null,2)+"\n");

// Forward research is strictly a distinct ledger from the historical backtest or real PAPER.
// All new virtual entries require a later settled observation, never a same-day signal price.
let priorForward=null;
if(process.env.FENICE_PHASE5_FORWARD_LEDGER_PATH){
 try{priorForward=JSON.parse(await readFile(process.env.FENICE_PHASE5_FORWARD_LEDGER_PATH,"utf8"));}
 catch(e){if(e.code!=="ENOENT")throw e;}
}
let frozenSignals=[];
if(process.env.FENICE_PHASE4_JOURNAL_PATH){
 const existingJournal=JSON.parse(await readFile(process.env.FENICE_PHASE4_JOURNAL_PATH,"utf8"));
 frozenSignals=existingJournal.journal;
}
const forward=advancePhase5ForwardResearch({existing:priorForward,signalJournal:frozenSignals,
 histories:fetched.histories,fxReference,nowIso});
await writeFile("artifacts/phase5/latest-forward-research-portfolio.json",JSON.stringify({
 ...forward.summary,sourceCoverage:coveragePolicy},null,2)+"\n");
if(process.env.FENICE_PHASE5_FORWARD_LEDGER_PATH){
 const path=process.env.FENICE_PHASE5_FORWARD_LEDGER_PATH;
 await mkdir(path.slice(0,path.lastIndexOf("/"))||".",{recursive:true});
 await writeFile(path+".tmp",JSON.stringify(forward.ledger,null,2)+"\n");
 await rename(path+".tmp",path);
}
await mkdir("artifacts/phase6",{recursive:true});
await writeFile("artifacts/phase6/latest-forward-risk-report.json",JSON.stringify({...forward.summary.riskState,generatedAt:nowIso,ledgerHeadHash:forward.ledger.headHash,sourceCoverage:coveragePolicy},null,2)+"\n");
console.log(JSON.stringify({phase5Forward:"UNATTESTED_VIRTUAL_ONLY",
 opened:forward.summary.openedThisRun,closed:forward.summary.closedThisRun,
 active:forward.summary.openPositions.length,wins:forward.summary.wins,losses:forward.summary.losses,
 certifiedPaper:false,ordersGenerated:0}));

await mkdir("artifacts/phase3",{recursive:true});
await writeFile("artifacts/phase3/world-research-watchlist.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({status:acquisitionStatus,requested:report.requestedSymbols,received:report.receivedHistories,ranked:watchlist.candidates.length,fetchErrors:fetched.errors.length,rejected:watchlist.rejected.length,realPaperCertified:false,ordersGenerated:0}));
