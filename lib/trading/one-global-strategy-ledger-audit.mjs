/**
 * ONE GLOBAL forward STRATEGY ledger auditor (read only).
 *
 * Replays existing World PAPER deterministic fees/cash/position/hash chain,
 * then counts strategy-tagged virtual round trips. Critically, the current
 * World PAPER event records source FAMILY NAMES, not immutable independently
 * attested provider receipts. Such a record can support engineering P&L
 * diagnosis but it CANNOT be phase-9 independent executable evidence.
 */
import { runWorldPaperV7 } from "./world-paper-v7.mjs";
import { summarizeOneGlobalVirtualAccounting } from "./one-global-strategy-exits.mjs";

const ENTRY=/^oneglobal-[a-f0-9]{24}$/;
const EXIT=/^oneglobal-exit-[a-f0-9]{24}$/;
const EXACT_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function time(value){
  if(typeof value!=="string"||!EXACT_UTC.test(value))return NaN;
  const at=Date.parse(value);
  return Number.isFinite(at)&&new Date(at).toISOString()===value?at:NaN;
}
const fresh=()=>({
  status:"NOT_STARTED",journalPresent:false,valid:false,
  virtualBuys:0,virtualSells:0,closedVirtualRoundTrips:0,
  distinctVirtualExitMarkets:0,distinctVirtualExitDays:0,
  observedVirtualSourceFamilies:[],realizedNetEuro:null,
  hasIndependentlyAuthenticatedExecutionReceipts:false,
  forwardStrategyCertificationCredit:0,
  brokerConnectivityAllowed:false,liveTradingAllowed:false,
});
const invalid=(reason)=>({...fresh(),status:"INVALID",journalPresent:true,reason});

export function auditOneGlobalStrategyLedger({ledger,nowIso}={}){
  if(ledger==null)return fresh();
  const now=time(nowIso);
  if(!Number.isFinite(now))return invalid("INVALID_AUDIT_CLOCK");
  if(typeof ledger!=="object"||Array.isArray(ledger)
    ||!Array.isArray(ledger.events)||ledger.events.length>5000)
    return invalid("STRATEGY_LEDGER_SCHEMA_OR_SIZE");
  try {
    // This validates the entire immutable chain, historical cash,
    // fee/slippage model, position accounting, and event identities.
    const replay=runWorldPaperV7({
      nowIso,previousLedger:ledger, paperRunAuthorized:false,
      instruments:[],sessions:[],quotes:[],fx:[],intents:[],
      entitlements:{sources:[],sessions:[],fx:[]},
    });
    if(replay.summary.filledPaperOrders!==0 || replay.fills.length!==0
      || replay.liveTradingAllowed!==false || replay.brokerConnectivityAllowed!==false)
      return invalid("READ_ONLY_REPLAY_BREACH");
    let previous=-Infinity;
    const markets=new Set(),days=new Set(),families=new Set();
    for(const e of replay.paperLedger.events){
      const at=time(e?.executedAt);
      if(!Number.isFinite(at)||at>now||at<previous)
        return invalid("FUTURE_OR_BACKDATED_STRATEGY_EVENT");
      previous=at;
      if(e.simulated!==true||e.liveTradingAllowed!==false
        ||e.executionTransferableToBroker===true
        ||(e.side==="BUY"?!ENTRY.test(e.intentId):!EXIT.test(e.intentId)))
        return invalid("NON_STRATEGY_OR_LIVE_EVENT");
      // These labels are useful for discrepancy diagnosis, NOT
      // legal proof that vendors licensed automated execution.
      if(!Array.isArray(e.evidenceFamilies)||e.evidenceFamilies.length<2
        ||e.evidenceFamilies.some(x=>typeof x!=="string"||!x.trim())
        ||new Set(e.evidenceFamilies.map(x=>x.toLowerCase())).size<2)
        return invalid("UNATTRIBUTED_VIRTUAL_SOURCE_LABELS");
      for(const f of e.evidenceFamilies)families.add(f.toLowerCase());
      if(e.side==="SELL"){markets.add(e.mic);days.add(e.executedAt.slice(0,10));}
    }
    const totals=summarizeOneGlobalVirtualAccounting(replay.paperLedger);
    return {
      status:totals.virtualBuys||totals.virtualSells
        ?"REPLAY_VALID_UNCERTIFIED":"EMPTY_APPROVAL_REQUIRED",
      journalPresent:true,valid:true,
      virtualBuys:totals.virtualBuys,virtualSells:totals.virtualSells,
      closedVirtualRoundTrips:totals.closedPositionRoundTrips,
      distinctVirtualExitMarkets:markets.size,distinctVirtualExitDays:days.size,
      observedVirtualSourceFamilies:[...families].sort(),
      realizedNetEuro:totals.realizedNetEuro,
      lastLedgerHash:totals.lastLedgerHash,
      hasIndependentlyAuthenticatedExecutionReceipts:false,
      forwardStrategyCertificationCredit:0,
      brokerConnectivityAllowed:false,liveTradingAllowed:false,
    };
  }catch{
    return invalid("WORLD_PAPER_HASH_OR_CASH_REPLAY_FAILED");
  }
}
