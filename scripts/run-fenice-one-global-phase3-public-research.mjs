/** Phase 3 public-data research run. No credentials, orders, ledger or broker access. */
import {writeFile,mkdir} from "node:fs/promises";
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
const report={schemaVersion:1,generatedAt:nowIso,mode:"PUBLIC_UNATTESTED_WORLD_RESEARCH",acquisitionStatus,coverage,source:"Yahoo Finance public chart HTTP; no independent attestation",requestedSymbols:symbols.length,receivedHistories:fetched.histories.length,fetchErrors:fetched.errors,watchlist,realPaperCertified:false,liveTradingAllowed:false,ordersGenerated:0};
await mkdir("artifacts/phase3",{recursive:true});
await writeFile("artifacts/phase3/world-research-watchlist.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({status:acquisitionStatus,requested:report.requestedSymbols,received:report.receivedHistories,ranked:watchlist.candidates.length,fetchErrors:fetched.errors.length,rejected:watchlist.rejected.length,realPaperCertified:false,ordersGenerated:0}));
