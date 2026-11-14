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
    ||r.sourceOutcomes.some(x=>!['alpha-vantage','eodhd','twelve-data','alpaca-sip','euronext-mifir','cboe-eu-mifir'].includes(x?.providerId)||!state(x?.state)))fail();
  const gates=['originalSettlementContextPresent','ownerPaperAuthorityValidated','sourceRightsEvidenceValidated',
    'upstreamEvidenceValidated','exchangeSessionEvidenceValidated','sourceEvidenceArchived'];
  if(gates.some(k=>typeof r[k]!=='boolean')||r.paperFillsCreated===1&&gates.some(k=>r[k]!==true))fail();
  const p=r.providerConfiguration;
  if(!p||['alphaVantageKeyPresent','eodhdPersonalKeyPresent','twelveDataKeyPresent'].some(k=>typeof p[k]!=='boolean'))fail();
  let sourceAccessCheck;
  if(r.sourceAccessCheck!==undefined){
    const q=r.sourceAccessCheck;
    if(!q||!state(q.state)||q.symbol!=='AAPL'||!/^\d{4}-\d\d-\d\d$/.test(q.sessionDate||'')
      ||!state(q.alphaState)||!state(q.alpacaState)||!state(q.eodhdState)||!integer(q.originalDocumentsArchived,2)
      ||q.rightsApproved!==false||q.independenceCertified!==false||q.paperFillsCreated!==0||q.liveTradingAllowed!==false
      ||['twoDailyRowsReceived','closesAgree','rawReceiptArchiveConfirmed','originalDocumentsConnected'].some(k=>typeof q[k]!=='boolean')
      ||q.closesAgree&&!q.twoDailyRowsReceived)fail();
    if(q.technicalReviewsConnected!==undefined){
      if(!integer(q.technicalReviewsConnected,2)||!['PRIVATE_SCOPE_TEXT_SUPPORTED','UNKNOWN_ORIGINAL_REVISION'].includes(q.alphaDocumentReview)
        ||!['ACCOUNT_SCOPE_UNRESOLVED','UNKNOWN_ORIGINAL_REVISION'].includes(q.alpacaDocumentReview))fail();
    }
    if(q.originalDocumentConnectionState!==undefined&&!state(q.originalDocumentConnectionState)
      ||q.candidateContextBytes!==undefined&&!integer(q.candidateContextBytes,1500000))fail();
    sourceAccessCheck=Object.fromEntries(['state','symbol','sessionDate','alphaState','alpacaState','eodhdState','twoDailyRowsReceived',
      'closesAgree','rawReceiptArchiveConfirmed','originalDocumentsArchived','originalDocumentsConnected','rightsApproved','independenceCertified',
      'paperFillsCreated','liveTradingAllowed'].map(k=>[k,q[k]]));
    if(q.originalDocumentConnectionState!==undefined)sourceAccessCheck.originalDocumentConnectionState=q.originalDocumentConnectionState;
    if(q.candidateContextBytes!==undefined)sourceAccessCheck.candidateContextBytes=q.candidateContextBytes;
    if(q.technicalReviewsConnected!==undefined)Object.assign(sourceAccessCheck,{technicalReviewsConnected:q.technicalReviewsConnected,
      alphaDocumentReview:q.alphaDocumentReview,alpacaDocumentReview:q.alpacaDocumentReview});
  }
  let euSourceAccessCheck;
  if(r.euSourceAccessCheck!==undefined){
    const q=r.euSourceAccessCheck;
    if(!q||!['EU_SOURCE_ACCESS_NOT_CONFIRMED','EU_TWO_INDEPENDENT_VENUE_OBSERVATIONS_VERIFIED',
      'EU_SOURCE_PAIR_DIVERGES_OR_INCOMPLETE'].includes(q.state)
      ||!/^(?:2026)-\d\d-\d\d$/.test(q.sessionDate||'')
      ||!integer(q.sourcePairsReceived,2)||!integer(q.sourcePairsAgree,2)||!integer(q.uptrendCandidates,2)
      ||q.sourcePairsAgree>q.sourcePairsReceived||q.uptrendCandidates>q.sourcePairsReceived
      ||typeof q.rawArtifactsVerified!=='boolean'||typeof q.rightsEvidenceConnected!=='boolean'
      ||q.paperFillsCreated!==0||q.certifiedTrades!==0||q.liveTradingAllowed!==false||q.brokerConnectivityAllowed!==false
      ||q.blocker!==undefined&&(!state(q.blocker)||!q.blocker.startsWith('EU_')&&!q.blocker.startsWith('CLOUD_EU_')))
      fail();
    euSourceAccessCheck=Object.fromEntries(['state','sessionDate','sourcePairsReceived','sourcePairsAgree','uptrendCandidates',
      'rawArtifactsVerified','rightsEvidenceConnected','paperFillsCreated','certifiedTrades','liveTradingAllowed','brokerConnectivityAllowed']
      .map(k=>[k,q[k]]));
    if(q.blocker!==undefined)euSourceAccessCheck.blocker=q.blocker;
  }
  if(p.alpacaSipKeyPresent!==undefined&&typeof p.alpacaSipKeyPresent!=='boolean')fail();
  return {...(sourceAccessCheck?{sourceAccessCheck}:{}),...(euSourceAccessCheck?{euSourceAccessCheck}:{}),
    state:r.state,originalJournalVerified:true,originalEventsPreserved:true,
    journalEventCount:r.journalEventCount,pendingSignalCount:r.pendingSignalCount,
    virtualFillCount:r.virtualFillCount,paperFillsCreated:r.paperFillsCreated,newSignals:r.newSignals,
    sourcePairsAttempted:r.sourcePairsAttempted,settlementState:r.settlementState,
    settlementSourceRequests:r.settlementSourceRequests,settlementBlockers:[...r.settlementBlockers],
    sourceOutcomes:r.sourceOutcomes.map(x=>({providerId:x.providerId,state:x.state})),
    ...Object.fromEntries(gates.map(k=>[k,r[k]])),
    providerConfiguration:{alphaVantageKeyPresent:p.alphaVantageKeyPresent,
      eodhdPersonalKeyPresent:p.eodhdPersonalKeyPresent,twelveDataKeyPresent:p.twelveDataKeyPresent,
      ...(p.alpacaSipKeyPresent!==undefined?{alpacaSipKeyPresent:p.alpacaSipKeyPresent}:{})},
    certifiedTrades:0,phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
}
