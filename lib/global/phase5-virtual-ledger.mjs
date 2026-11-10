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
  if(!t||t.classification!=="HISTORICAL_SIMULATION_NOT_LIVE_FILL"||typeof t.instrumentId!=="string"||typeof t.entryAt!=="string"||typeof t.exitAt!=="string"||!Number.isFinite(Date.parse(t.entryAt))||!Number.isFinite(Date.parse(t.exitAt))||Date.parse(t.exitAt)>Date.parse(recordedAt)||!Number.isFinite(t.netPnlEuro))throw Error("INVALID_PHASE5_VIRTUAL_TRADE");
  const key=[t.instrumentId,t.entryAt,t.exitAt].join("|");
  if(seen.has(key)){duplicates++;continue;}
  const trade={key,instrumentId:t.instrumentId,mic:t.mic,entryAt:t.entryAt,exitAt:t.exitAt,netPnlEuro:t.netPnlEuro,classification:t.classification,recordedAt,brokerOrderId:null};
  const row={previousHash,trade};row.hash=hash(row);out.push(row);previousHash=row.hash;seen.add(key);appended++;
 }
 return {mode:"PHASE5_HISTORICAL_VIRTUAL_LEDGER_NOT_LIVE",journal:out,headHash:previousHash,appended,duplicates,ordersGenerated:0,liveTradingAllowed:false};
}
