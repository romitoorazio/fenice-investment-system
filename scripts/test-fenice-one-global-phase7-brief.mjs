import assert from "node:assert/strict";
import {buildPhase7WorldBrief,formatPhase7WorldMarkdown} from "../lib/global/phase7-world-brief.mjs";
const coverage={status:"COMPLETE",requested:8,received:8,ranked:8,minimumRequired:7,
 eligibleForResearchPersistence:true,verifiedForPaper:false};
const venues=["XTKS","XHKG","XNSE","XMIL","XETR","XLON","XNAS","XNYS"];
const candidates=venues.map((mic,i)=>({mic,instrumentId:mic+":TEST",observedAt:"2026-11-09T08:00:00Z",
 score:5-i,dataVerified:false,executable:false,sourceUrl:"https://query1.finance.yahoo.com/v8/finance/chart/TEST"}));
const research={mode:"PUBLIC_UNATTESTED_WORLD_RESEARCH",generatedAt:"2026-11-10T13:00:00Z",
 ordersGenerated:0,realPaperCertified:false,liveTradingAllowed:false,coveragePolicy:coverage,watchlist:{candidates}};
const forward={mode:"PHASE5_FORWARD_UNATTESTED_VIRTUAL_RESEARCH",generatedAt:"2026-11-10T13:00:00Z",
 realPaperCertified:false,liveTradingAllowed:false,paperFillAuthorized:false,ordersGenerated:0,
 ledgerHeadHash:"GENESIS",openPositions:[],closedTrades:0,wins:0,losses:0,
 totalEvents:0,realizedNetPnlEuro:0,cashEuro:1000,
 riskState:{riskState:"ACTIVE",haltNewVirtualEntries:false},sourceCoverage:coverage,rejected:[]};
const risk={mode:"PHASE6_VIRTUAL_FORWARD_RISK_RESEARCH_ONLY",generatedAt:"2026-11-10T13:00:00Z",
 realPaperCertified:false,liveTradingAllowed:false,ordersGenerated:0,ledgerHeadHash:"GENESIS",
 riskState:"ACTIVE",haltNewVirtualEntries:false,maxRealizedDrawdownPct:0,
 closedTrades:0,wins:0,losses:0,realizedNetPnlEuro:0};
const historical={mode:"PHASE5_HISTORICAL_VIRTUAL_PORTFOLIO_NOT_LIVE",
 realPaperCertified:false,liveTradingAllowed:false,ordersGenerated:0,
 netPnlEuro:-14.2712,endingCashEuro:985.7288};
const props={research,forward,risk,historical,nowIso:"2026-11-10T14:00:00Z"};
const brief=buildPhase7WorldBrief(props);
assert.equal(brief.opportunities.length,5);
assert.equal(brief.universe.received,8);
assert.equal(brief.opportunities[0].mic,"XTKS");
assert.equal(brief.forward.netRealizedEuro,0);
assert.equal(brief.historicalSeparate.netPnlEuro,-14.2712);
assert.equal(brief.certifiedPaper,false);
assert.equal(brief.ordersGenerated,0);
const md=formatPhase7WorldMarkdown(brief);
assert.match(md,/FENICE ONE GLOBAL/);assert.match(md,/−€14,27/);assert.match(md,/Ordini Directa/);
assert(!md.includes("BUY"));
assert.throws(()=>buildPhase7WorldBrief({...props,forward:{...forward,ordersGenerated:1}}),/BROKER_SAFETY/);
assert.throws(()=>buildPhase7WorldBrief({...props,forward:{...forward,ledgerHeadHash:"wrong"}}),/LEDGER_RISK/);
assert.throws(()=>buildPhase7WorldBrief({...props,research:{...research,generatedAt:"2026-11-12T00:00:00Z"}}),/TIME/);
assert.throws(()=>buildPhase7WorldBrief({...props,research:{...research,watchlist:{candidates:[candidates[0],candidates[0],...candidates.slice(2)]}}}),/INVALID_RESEARCH_ITEM/);
const stopped=buildPhase7WorldBrief({...props,forward:{...forward,riskState:{riskState:"HALT_NEW_VIRTUAL_ENTRIES",haltNewVirtualEntries:true}},
 risk:{...risk,riskState:"HALT_NEW_VIRTUAL_ENTRIES",haltNewVirtualEntries:true}});
assert.equal(stopped.risk.haltNewVirtualEntries,true);
const negative=buildPhase7WorldBrief({...props,research:{...research,watchlist:{candidates:candidates.map(x=>({...x,score:-4}))}}});
assert.equal(negative.opportunities.length,0);
assert.match(formatPhase7WorldMarkdown(negative),/Nessun punteggio positivo/);
console.log("FENICE Phase7 world operational brief: research, historical separation, risk, provenance, no real orders PASS");
