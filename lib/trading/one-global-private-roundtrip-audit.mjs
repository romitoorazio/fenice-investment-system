/**
 * Read-only forensic link between a prospective BUY and the SELL that closed
 * the same original private position. Never creates prices, signals, FILLs,
 * approvals or certification credit. The per-FILL 10-check auditor still has
 * to independently verify BOTH immutable source/clock archives.
 */
import {replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';
import {auditOneGlobalFirstPrivateFill} from './one-global-private-forensic-audit.mjs';

const LIMIT=1_500_000;
const round=x=>Math.round((x+Number.EPSILON)*10000)/10000;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const safe=(state,extra={})=>({
  mode:'ONE_GLOBAL_PRIVATE_ROUNDTRIP_FORENSIC_READ_ONLY',state,
  roundTripForensicallyVerified:false,virtualPerformanceCertified:false,
  strategyPerformanceCertified:false,sourceRightsIndependentlyCertified:false,
  actualBrokerExecutionProven:false,certifiedTrades:0,phase9Credit:0,
  journalMutationAllowed:false,paperFillsCreated:0,
  brokerConnectivityAllowed:false,liveTradingAllowed:false,...extra,
});
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))
  &&new Date(x).toISOString()===x;

/** Pure matching against the full original immutable replay.  Never look
 * merely at the latest two FILLs: other markets may be interleaved. */
export function findOneGlobalPrivateClosedRoundTrips(ledger){
  const replay=replayOneGlobalEodPaperLedger(ledger);
  const openings=new Map(),closed=[];
  let ordinal=0,realized=0;
  for(const event of ledger.events){
    if(event.kind!=='FILL')continue;
    ordinal++;
    if(event.side==='BUY'){
      if(openings.has(event.key))throw Error('ROUNDTRIP_OVERLAPPING_BUY');
      openings.set(event.key,{event,ordinal});
      continue;
    }
    if(event.side!=='SELL')throw Error('ROUNDTRIP_SIDE_INVALID');
    const bought=openings.get(event.key);
    if(!bought||Math.abs(bought.event.quantity-event.quantity)>0.000001)
      throw Error('ROUNDTRIP_UNMATCHED_SELL');
    const cost=round(bought.event.notionalEuro+bought.event.feeEuro);
    const proceeds=round(event.notionalEuro-event.feeEuro);
    const net=round(proceeds-cost);
    if(![cost,proceeds,net].every(finite))throw Error('ROUNDTRIP_AMOUNT_INVALID');
    closed.push({buy:bought.event,sell:event,buyOrdinal:bought.ordinal,
      sellOrdinal:ordinal,netEuro:net});
    realized=round(realized+net);
    openings.delete(event.key);
  }
  if(closed.length!==replay.closedVirtualRoundTrips
    ||realized!==replay.realizedNetEuro
    ||ordinal!==replay.virtualBuys+replay.virtualSells)
    throw Error('ROUNDTRIP_REPLAY_PNL_MISMATCH');
  return {closed,replay};
}

const verified=(audit,event,ordinal)=>audit?.state==='FILL_RIGOROUS_REPLAY_VERIFIED'
  &&audit.fillOrdinal===ordinal&&audit.identity?.fillHash===event.hash
  &&audit.identity?.key===event.key&&audit.identity?.side===event.side
  &&audit.accounting?.quantity===event.quantity
  &&audit.accounting?.feeEuro===event.feeEuro
  &&audit.accounting?.notionalEuro===event.notionalEuro
  &&Array.isArray(audit.checks)&&audit.checks.length===10
  &&audit.checks.every(x=>x?.verified===true)
  &&Array.isArray(audit.missingEvidence)&&audit.missingEvidence.length===0
  &&Array.isArray(audit.defects)&&audit.defects.length===0
  &&audit.journalMutationAllowed===false&&audit.paperFillsCreated===0
  &&audit.certifiedTrades===0&&audit.phase9Credit===0
  &&audit.liveTradingAllowed===false&&audit.brokerConnectivityAllowed===false;

/**
 * Requires the same original owner-scoped private store used by existing
 * forensic audits. A test-only injected auditor must never be exposed as an
 * HTTP argument; the production route calls this with the default auditor.
 */
export async function auditOneGlobalLatestPrivateRoundTrip({
  storage,nowIso=new Date().toISOString(),auditFill=auditOneGlobalFirstPrivateFill
}={}){
  if(storage?.privateAccess!==true||storage.durable!==true
    ||typeof storage.read!=='function'
    ||typeof storage.readResearchObservation!=='function'
    ||typeof storage.readSourceArtifact!=='function')
    return safe('PRIVATE_READ_ONLY_EVIDENCE_ACCESS_REQUIRED');
  if(!iso(nowIso)||typeof auditFill!=='function')return safe('ROUNDTRIP_AUDIT_INPUT_INVALID');
  try{
    const first=await storage.read();
    if(typeof first?.body!=='string'||!first?.etag
      ||Buffer.byteLength(first.body,'utf8')>LIMIT)
      return safe('ORIGINAL_JOURNAL_SNAPSHOT_UNAVAILABLE');
    const ledger=JSON.parse(first.body);
    const {closed,replay}=findOneGlobalPrivateClosedRoundTrips(ledger);
    if(!closed.length)return safe('NO_CLOSED_VIRTUAL_ROUNDTRIP',{
      closedVirtualRoundTrips:0,virtualBuyCount:replay.virtualBuys,
      virtualSellCount:replay.virtualSells});
    const last=closed.at(-1);
    // Both historical originals must independently pass all ten immutable
    // provenance, timing, rights, source and accounting checks.
    const [entry,exit]=await Promise.all([
      auditFill({storage,nowIso,fillOrdinal:last.buyOrdinal}),
      auditFill({storage,nowIso,fillOrdinal:last.sellOrdinal}),
    ]);
    const after=await storage.read();
    if(after?.etag!==first.etag||after.body!==first.body)
      return safe('ORIGINAL_JOURNAL_CHANGED_DURING_ROUNDTRIP_AUDIT');
    const buyPass=verified(entry,last.buy,last.buyOrdinal);
    const sellPass=verified(exit,last.sell,last.sellOrdinal);
    if(!buyPass||!sellPass)
      return safe('ROUNDTRIP_FORENSIC_EVIDENCE_INCOMPLETE',{
        closedVirtualRoundTrips:closed.length,
        entryChecksPassed:Array.isArray(entry?.checks)?entry.checks.slice(0,10).filter(x=>x?.verified===true).length:0,
        exitChecksPassed:Array.isArray(exit?.checks)?exit.checks.slice(0,10).filter(x=>x?.verified===true).length:0});
    return safe('VIRTUAL_ROUNDTRIP_FORENSIC_10_OF_10',{
      roundTripForensicallyVerified:true,
      closedVirtualRoundTrips:closed.length,
      entryChecksPassed:10,exitChecksPassed:10,
      lastRoundTripNetEuro:last.netEuro,
      realizedTotalNetEuro:replay.realizedNetEuro,
      lastRoundTripDirection:last.netEuro>0?'GAIN':last.netEuro<0?'LOSS':'FLAT',
      accountingBasis:'ORIGINAL_BUY_SELL_FEES_AND_SLIPPAGE_REPLAY',
      // A verified virtual round trip is NOT an independently certified
      // investment strategy or a broker/market execution receipt.
      virtualPerformanceCertified:false,
    });
  }catch{
    // Never expose provider text, raw quotes, blob hashes, exception stacks or
    // original identities through an owner endpoint or Actions log.
    return safe('ROUNDTRIP_AUDIT_NOT_CONFIRMED');
  }
}
