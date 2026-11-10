/** FENICE Phase 5 research-only append ledger. Not an execution ledger or broker order log. */
import {createHash} from "node:crypto";
const hash=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
export function appendPhase5VirtualLedger({journal=[],trades=[],recordedAt=new Date().toISOString()}={}){
 if(!Array.isArray(journal)||!Array.isArray(trades)||!Number.isFinite(Date.parse(recordedAt)))throw Error("INVALID_PHASE5_LEDGER_INPUT");
 let previousHash="GENESIS";const seen=new Set();
 for(const row of journal){
  if(!row||row.previousHash!==previousHash||row.hash!==hash({previousHash:row.previousHash,trade:row.trade})||!row.trade||seen.has(row.trade.key))throw Error("PHASE5_LEDGER_INTEGRITY_FAILURE");
  previousHash=row.hash;seen.add(row.trade.key);
 }
 const out=journal.map(x=>({...x}));let appended=0,duplicates=0;
 for(const t of trades){
  if(!t||t.classification!=="HISTORICAL_SIMULATION_NOT_LIVE_FILL"||typeof t.instrumentId!=="string"||typeof t.entryAt!=="string"||typeof t.exitAt!=="string"||!Number.isFinite(Date.parse(t.entryAt))||!Number.isFinite(Date.parse(t.exitAt))||Date.parse(t.exitAt)>Date.parse(recordedAt)||!Number.isFinite(t.netPnlEuro)||!Number.isFinite(t.entryPrice)||t.entryPrice<=0||!Number.isFinite(t.exitPrice)||t.exitPrice<=0||!Number.isFinite(t.quantity)||t.quantity<=0)throw Error("INVALID_PHASE5_VIRTUAL_TRADE");
  const key=[t.instrumentId,t.entryAt,t.exitAt].join("|");
  if(seen.has(key)){duplicates++;continue;}
  const trade={key,instrumentId:t.instrumentId,mic:t.mic,entryAt:t.entryAt,exitAt:t.exitAt,netPnlEuro:t.netPnlEuro,entryPrice:t.entryPrice,exitPrice:t.exitPrice,quantity:t.quantity,classification:t.classification,recordedAt,brokerOrderId:null};
  const row={previousHash,trade};row.hash=hash(row);out.push(row);previousHash=row.hash;seen.add(key);appended++;
 }
 const potentiallyUnsettled=out.filter(row=>typeof row.trade.recordedAt==="string"&&row.trade.exitAt.slice(0,10)===row.trade.recordedAt.slice(0,10)).map(row=>({key:row.trade.key,reason:"SAME_DAY_DAILY_BAR_POTENTIALLY_UNSETTLED"}));
 return {mode:"PHASE5_HISTORICAL_VIRTUAL_LEDGER_NOT_LIVE",journal:out,headHash:previousHash,appended,duplicates,integrityAudit:{potentiallyUnsettled,authoritativeProfitClaim:false},ordersGenerated:0,liveTradingAllowed:false};
}

/** Validate the persisted envelope as well as each immutable journal hash. */
export function validatePhase5PersistedLedger(document,recordedAt=new Date().toISOString()){
 if(!document||document.schemaVersion!==1||document.mode!=="PHASE5_HISTORICAL_VIRTUAL_LEDGER_NOT_LIVE"||document.liveTradingAllowed!==false||document.ordersGenerated!==0||!Array.isArray(document.journal)||typeof document.headHash!=="string")throw Error("INVALID_EXISTING_PHASE5_LEDGER");
 const verified=appendPhase5VirtualLedger({journal:document.journal,trades:[],recordedAt});
 if(document.headHash!==verified.headHash)throw Error("PHASE5_LEDGER_HEAD_MISMATCH");
 return document.journal;
}

/** A duplicate key is immutable: keep the original observed prices, explicitly disclose later provider revisions. */
export function reconcilePhase5PortfolioToLedger({portfolio,ledger}={}){
 if(!portfolio||portfolio.mode!=="PHASE5_HISTORICAL_VIRTUAL_PORTFOLIO_NOT_LIVE"||!Array.isArray(portfolio.trades)||!ledger||!Array.isArray(ledger.journal)||ledger.liveTradingAllowed!==false||ledger.ordersGenerated!==0)throw Error("INVALID_PHASE5_RECONCILIATION");
 const saved=new Map(ledger.journal.map(row=>[row.trade?.key,row.trade]));
 const revisions=[];
 const fields=["quantity","entryPrice","exitPrice","netPnlEuro"];
 const trades=portfolio.trades.map(t=>{
  const key=[t.instrumentId,t.entryAt,t.exitAt].join("|");
  const canonical=saved.get(key);
  if(!canonical||canonical.classification!==t.classification||canonical.instrumentId!==t.instrumentId||canonical.mic!==t.mic)throw Error("PHASE5_LEDGER_TRADE_NOT_FOUND");
  const differences=fields.filter(field=>t[field]!==canonical[field]);
  if(differences.length)revisions.push({key,fields:differences,originalNetPnlEuro:canonical.netPnlEuro,recomputedNetPnlEuro:t.netPnlEuro});
  return {...t,...Object.fromEntries(fields.map(field=>[field,canonical[field]]))};
 });
 const netPnlEuro=Number(trades.reduce((sum,t)=>sum+t.netPnlEuro,0).toFixed(4));
 const endingCashEuro=Number((portfolio.initialCashEuro+netPnlEuro).toFixed(4));
 return {...portfolio,trades,netPnlEuro,endingCashEuro,reconciliation:{policy:"IMMUTABLE_FIRST_OBSERVATION_LEDGER_CANONICAL",originalRecomputedNetPnlEuro:portfolio.netPnlEuro,repricedDuplicateCount:revisions.length,repricedDuplicates:revisions,ledgerEntries:ledger.journal.length,ledgerHeadHash:ledger.headHash,potentiallyUnsettledLegacyTrades:ledger.integrityAudit?.potentiallyUnsettled??[],realPaperCertified:false}};
}
