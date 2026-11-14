/**
 * Safety boundary for unattended GitHub Actions EOD research:
 * real vendor data may pass the strict prospective SIGNAL gate *in memory*,
 * but the canonical PRIVATE journal is neither created nor updated here.
 */
import {newOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';
import {planPrivateEodSignalCycle} from './one-global-private-eod-autopilot.mjs';
import {buildOneGlobalProspectiveSignalFromDualEod} from './one-global-prospective-dual-eod-bridge.mjs';

const fail=x=>{throw Error('CLOUD_EOD_'+x);};
export function cloudResearchPlan(nowIso){
  const plan=planPrivateEodSignalCycle({
    nowIso,originalLedger:newOneGlobalEodPaperLedger(),
  });
  return {
    mode:'ONE_GLOBAL_CLOUD_DUAL_EOD_RESEARCH_READINESS',
    checkedAt:nowIso,sessionDate:plan.sessionDate,
    nyWeekday:plan.nyWeekday,withinNewYorkPostcloseWindow:plan.expectedPostcloseWindow,
    symbols:plan.candidates.map(x=>x.symbol),
    originalPrivateJournalConnected:false,
    originalPrivateJournalChanged:false,
    paperFillsCreated:0,certifiedTrades:0,phase9Credit:0,
    providerUpstreamsIndependentlyCertified:false,
    providerRightsIndependentlyReviewed:false,
    liveTradingAllowed:false,brokerConnectivityAllowed:false,
  };
}
export function classifyCloudResearchReport({nowIso,report}){
  const plan=cloudResearchPlan(nowIso);
  if(!plan.withinNewYorkPostcloseWindow)
    return {symbol:report?.symbol??null,status:'OUTSIDE_EXCHANGE_LOCAL_WINDOW'};
  if(!report||typeof report!=='object'||Array.isArray(report)||!['AAPL','MSFT','TSLA'].includes(report.symbol))
    fail('UNTRUSTED_PROVIDER_REPORT');
  // Run the same rigorous forward temporal, trend and multi-source gates as
  // the ORIGINAL private EOD SIGNAL engine. This in-memory journal is used
  // ONLY for preflight; it is discarded immediately and is NEVER persisted
  // or described as an actual investor decision.
  try{
    const checked=buildOneGlobalProspectiveSignalFromDualEod({
      report,previousLedger:newOneGlobalEodPaperLedger(),nowIso,
    });
    if(checked.kind!=='SIGNAL'||checked.paperFillCreated!==false
       ||checked.ledger?.events?.length!==1||checked.ledger.events[0].kind!=='SIGNAL'
       ||checked.ledger.events[0].sourceRightsIndependentlyCertified!==false
       ||checked.ledger.liveTradingAllowed!==false)
      fail('RESEARCH_BRIDGE_SAFETY');
    return {
      symbol:report.symbol,status:'PROSPECTIVE_RESEARCH_GATE_PASSED_NOT_RECORDED',
      sessionDate:report.sessionDate,providerResponsesParsed:2,
      sourceIndependenceCertified:false,sourceRightsApproved:false,
      canonicalSignalCommitted:false,paperFillCreated:false,liveTradingAllowed:false,
    };
  }catch(e){
    if(String(e?.message??'').startsWith('CLOUD_EOD_'))throw e;
    const reason=String(e?.message??'');
    // Do not emit raw vendor bodies, receipt hashes or quoted close prices.
    const safe=/^EOD_PROSPECTIVE_BRIDGE_([A-Z0-9_]{3,96})$/.exec(reason)?.[0];
    return {
      symbol:report.symbol,status:safe??'RESEARCH_SIGNAL_GATE_REJECTED',
      providerResponsesParsed:2,sourceIndependenceCertified:false,
      canonicalSignalCommitted:false,paperFillCreated:false,liveTradingAllowed:false,
    };
  }
}
