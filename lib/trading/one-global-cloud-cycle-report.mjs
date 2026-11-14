/** Public Actions log allowlist. Private bytes, prices, hashes and consent never pass. */
const fail=()=>{throw Error('ONE_GLOBAL_PRIVATE_CLOUD_REPORT_NOT_VERIFIED');};
const integer=(x,max=10000)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
const state=x=>typeof x==='string'&&/^[A-Z][A-Z0-9_]{3,120}$/.test(x);
export function publicOneGlobalCloudCycleReport(r){
  if(!r||r.originalJournalVerified!==true||r.originalEventsPreserved!==true
    ||r.liveTradingAllowed!==false||r.brokerConnectivityAllowed!==false
    ||r.certifiedTrades!==0||r.phase9Credit!==0||!state(r.state)
    ||!integer(r.journalEventCount)||r.journalEventCount<3
    ||!integer(r.pendingSignalCount)||!integer(r.virtualFillCount)
    ||r.virtualFillCount>r.journalEventCount||r.pendingSignalCount>r.journalEventCount
    ||!integer(r.paperFillsCreated,1)||r.paperFillsCreated>r.virtualFillCount
    ||!integer(r.newSignals,1)||!integer(r.sourcePairsAttempted,3)
    ||!integer(r.settlementSourceRequests,3)
    ||!['NO_PENDING_SIGNAL_TO_SETTLE','SETTLEMENT_BLOCKED','STRICT_PAPER_FILL_COMMITTED_PRIVATE'].includes(r.settlementState)
    ||!Array.isArray(r.settlementBlockers)||r.settlementBlockers.length>40
    ||r.settlementBlockers.some(x=>!state(x)||!x.startsWith('CLOUD_SETTLEMENT_')&&!x.startsWith('EOD_PAPER_'))
    ||!Array.isArray(r.sourceOutcomes)||r.sourceOutcomes.length>3
    ||r.sourceOutcomes.some(x=>!['alpha-vantage','eodhd','twelve-data'].includes(x?.providerId)||!state(x?.state)))fail();
  const gates=['originalSettlementContextPresent','ownerPaperAuthorityValidated','sourceRightsEvidenceValidated',
    'upstreamEvidenceValidated','exchangeSessionEvidenceValidated','sourceEvidenceArchived'];
  if(gates.some(k=>typeof r[k]!=='boolean')||r.paperFillsCreated===1&&gates.some(k=>r[k]!==true))fail();
  const p=r.providerConfiguration;
  if(!p||['alphaVantageKeyPresent','eodhdPersonalKeyPresent','twelveDataKeyPresent'].some(k=>typeof p[k]!=='boolean'))fail();
  return {state:r.state,originalJournalVerified:true,originalEventsPreserved:true,
    journalEventCount:r.journalEventCount,pendingSignalCount:r.pendingSignalCount,
    virtualFillCount:r.virtualFillCount,paperFillsCreated:r.paperFillsCreated,newSignals:r.newSignals,
    sourcePairsAttempted:r.sourcePairsAttempted,settlementState:r.settlementState,
    settlementSourceRequests:r.settlementSourceRequests,settlementBlockers:[...r.settlementBlockers],
    sourceOutcomes:r.sourceOutcomes.map(x=>({providerId:x.providerId,state:x.state})),
    ...Object.fromEntries(gates.map(k=>[k,r[k]])),
    providerConfiguration:{alphaVantageKeyPresent:p.alphaVantageKeyPresent,
      eodhdPersonalKeyPresent:p.eodhdPersonalKeyPresent,twelveDataKeyPresent:p.twelveDataKeyPresent},
    certifiedTrades:0,phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
}
