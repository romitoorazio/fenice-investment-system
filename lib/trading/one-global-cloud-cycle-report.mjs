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
    // Multiple *independent* pending markets can each require 2-3 source
    // requests. Bound the count by the replayed journal size rather than the
    // old single-market cap; never accept arbitrary/unbounded claimed probes.
    ||!integer(r.settlementSourceRequests,Math.min(120,r.journalEventCount*3))
    ||!['NO_PENDING_SIGNAL_TO_SETTLE','SETTLEMENT_BLOCKED','STRICT_PAPER_FILL_COMMITTED_PRIVATE'].includes(r.settlementState)
    ||!Array.isArray(r.settlementBlockers)||r.settlementBlockers.length>40
    ||r.settlementBlockers.some(x=>!state(x)||!x.startsWith('CLOUD_SETTLEMENT_')&&!x.startsWith('EOD_PAPER_'))
    ||!Array.isArray(r.sourceOutcomes)||r.sourceOutcomes.length>3
    ||r.sourceOutcomes.some(x=>!['alpha-vantage','eodhd','twelve-data','alpaca-sip','alpaca-iex','euronext-mifir','cboe-eu-mifir'].includes(x?.providerId)||!state(x?.state)))fail();
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
    if(q.alpacaPriceScope!==undefined&&q.alpacaPriceScope!=='IEX_SINGLE_VENUE_NOT_CONSOLIDATED')fail();
    if(q.technicalReviewsConnected!==undefined){
      if(!integer(q.technicalReviewsConnected,2)||!['PRIVATE_SCOPE_TEXT_SUPPORTED','UNKNOWN_ORIGINAL_REVISION'].includes(q.alphaDocumentReview)
        ||!['ACCOUNT_SCOPE_UNRESOLVED','UNKNOWN_ORIGINAL_REVISION'].includes(q.alpacaDocumentReview))fail();
    }
    if(q.originalDocumentConnectionState!==undefined&&!state(q.originalDocumentConnectionState)
      ||q.candidateContextBytes!==undefined&&!integer(q.candidateContextBytes,1500000))fail();
    sourceAccessCheck=Object.fromEntries(['state','symbol','sessionDate','alphaState','alpacaState','eodhdState','twoDailyRowsReceived',
      'closesAgree','rawReceiptArchiveConfirmed','originalDocumentsArchived','originalDocumentsConnected','alpacaPriceScope','rightsApproved','independenceCertified',
      'paperFillsCreated','liveTradingAllowed'].map(k=>[k,q[k]]));
    if(q.originalDocumentConnectionState!==undefined)sourceAccessCheck.originalDocumentConnectionState=q.originalDocumentConnectionState;
    if(q.candidateContextBytes!==undefined)sourceAccessCheck.candidateContextBytes=q.candidateContextBytes;
    if(q.technicalReviewsConnected!==undefined)Object.assign(sourceAccessCheck,{technicalReviewsConnected:q.technicalReviewsConnected,
      alphaDocumentReview:q.alphaDocumentReview,alpacaDocumentReview:q.alpacaDocumentReview});
  }
  let usAdmissibility;
  if(r.usAdmissibility!==undefined){
    const q=r.usAdmissibility,allowed=[
      'US_NO_PENDING_PROSPECTIVE_SIGNAL','US_ORIGINAL_CONTEXT_NOT_CONNECTED',
      'US_ORIGINAL_CONSENT_OR_DOCUMENTS_INVALID','US_CONTEXT_READY_FOR_EXACT_DAILY_RECEIPTS',
      'US_NEXT_SESSION_NOT_COMPLETED','US_ADMISSION_BLOCKED','US_SETTLEMENT_WINDOW_EXPIRED',
    ];
    if(!q||!allowed.includes(q.state)||!integer(q.pendingUsSignals,3)
      ||!integer(q.configuredUsMarketMappings,3)||!integer(q.originalUsUsageDocuments,40)
      ||['sourceRightsEvidenceValidated','independentUpstreamEvidenceValidated','exchangeSessionEvidenceValidated']
        .some(k=>typeof q[k]!=='boolean')
      ||q.paperFillsCreated!==0||q.brokerConnectivityAllowed!==false||q.liveTradingAllowed!==false
      ||q.blocker!==undefined&&(!state(q.blocker)||!q.blocker.startsWith('CLOUD_SETTLEMENT_'))
      ||['US_CONTEXT_READY_FOR_EXACT_DAILY_RECEIPTS','US_NEXT_SESSION_NOT_COMPLETED'].includes(q.state)
        &&['sourceRightsEvidenceValidated','independentUpstreamEvidenceValidated','exchangeSessionEvidenceValidated']
          .some(k=>q[k]!==true)
      ||q.pendingUsSignals===0&&q.sourceRightsEvidenceValidated===true)fail();
    usAdmissibility=Object.fromEntries(['state','pendingUsSignals','configuredUsMarketMappings',
      'originalUsUsageDocuments','sourceRightsEvidenceValidated','independentUpstreamEvidenceValidated',
      'exchangeSessionEvidenceValidated','paperFillsCreated','brokerConnectivityAllowed','liveTradingAllowed']
      .map(k=>[k,q[k]]));
    if(q.blocker!==undefined)usAdmissibility.blocker=q.blocker;
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
  // The cloud cycle already evaluates EU prospective research separately from
  // settlement, but previously dropped its outcome from public logs. This
  // hard-coded allowlist exposes only outcome codes and integer counters:
  // never candidate prices, owner documents, raw receipts, URLs or hashes.
  let euSignalCycle;
  if(r.euSignalCycle!==undefined){
    const q=r.euSignalCycle;
    const allowed=new Set([
      'EU_RAW_ARTIFACT_STORE_NOT_CONNECTED','EU_OUTSIDE_POSTCLOSE_WINDOW',
      'EU_SESSION_SIGNAL_ALREADY_COMMITTED','EU_ALL_CANDIDATES_ALREADY_PENDING',
      'EU_ALL_CANDIDATES_ALREADY_HELD_OR_PENDING',
      'EU_OFFICIAL_SOURCE_PAIR_UNAVAILABLE','EU_NO_DUAL_VENUE_UPTREND',
      'EU_PROSPECTIVE_SIGNAL_COMMITTED_PRIVATE','EU_PROSPECTIVE_EXIT_SIGNAL_COMMITTED_PRIVATE',
    ]);
    if(!q||!allowed.has(q.state)||!integer(q.newSignals,1)
      ||!integer(q.sourcePairsAttempted,2)
      ||typeof q.canonicalSignalCommitted!=='boolean'
      ||q.sourceEvidenceArchived!==undefined&&typeof q.sourceEvidenceArchived!=='boolean'
      ||q.paperFillsCreated!==undefined&&q.paperFillsCreated!==0
      ||q.liveTradingAllowed!==undefined&&q.liveTradingAllowed!==false
      ||q.brokerConnectivityAllowed!==undefined&&q.brokerConnectivityAllowed!==false
      ||q.rightsAndNextSessionEvidenceConnected!==undefined
        &&typeof q.rightsAndNextSessionEvidenceConnected!=='boolean')fail();
    const committed=q.state==='EU_PROSPECTIVE_SIGNAL_COMMITTED_PRIVATE'
      ||q.state==='EU_PROSPECTIVE_EXIT_SIGNAL_COMMITTED_PRIVATE';
    if(committed!==(q.newSignals===1)||committed!==q.canonicalSignalCommitted
      ||committed&&(q.sourceEvidenceArchived!==true
        ||q.rightsAndNextSessionEvidenceConnected!==true
        ||r.newSignals!==1||r.paperFillsCreated!==0
        ||r.state!==q.state||r.sourceEvidenceArchived!==true)
      ||!committed&&q.rightsAndNextSessionEvidenceConnected===true
      ||!committed&&q.sourceEvidenceArchived===true)fail();
    euSignalCycle={
      state:q.state,newSignals:q.newSignals,sourcePairsAttempted:q.sourcePairsAttempted,
      canonicalSignalCommitted:q.canonicalSignalCommitted,
      sourceEvidenceArchived:q.sourceEvidenceArchived===true,
      rightsAndNextSessionEvidenceConnected:q.rightsAndNextSessionEvidenceConnected===true,
    };
  }
  if(p.alpacaSipKeyPresent!==undefined&&typeof p.alpacaSipKeyPresent!=='boolean')fail();
  return {...(sourceAccessCheck?{sourceAccessCheck}:{}),...(usAdmissibility?{usAdmissibility}:{}),...(euSourceAccessCheck?{euSourceAccessCheck}:{}),
    ...(euSignalCycle?{euSignalCycle}:{}),
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


/** Reconstructable, owner-private forensic result -> bounded GitHub metadata.
 * Explicitly NEVER release source hashes, price, symbol, portfolio or consent.
 * The existing OIDC workflow is already authorized to run the PAPER cycle;
 * this read-only attestation cannot write an original ledger event.
 */
export function publicOneGlobalFirstFillForensicSummary(r){
  const allChecks=[
    'ORIGINAL_HASH_CHAIN_AND_ACCOUNT_REPLAY',
    'ORIGINAL_SETTLEMENT_ARCHIVE_AND_RECEIPTS_BOUND_TO_FILL',
    'ORIGINAL_DOCUMENT_BYTES_CONSENT_RIGHTS_MAPPING_AND_EXACT_SESSION',
    'BOTH_ORIGINAL_VENUE_FILES_REPARSED_EXACTLY',
    'ARCHIVED_OFFICIAL_USAGE_POLICIES_CALENDAR_AND_DISCOVERY',
    'PROSPECTIVE_SIGNAL_RECOMPUTED_FROM_ORIGINAL_PRIOR_SESSION_BYTES',
    'EXACT_FILL_EVENT_QUANTITY_FEE_BALANCE_AND_HASH_REPRODUCED',
    'ONE_FILL_FOR_SIGNAL_AND_SINGLE_OPEN_POSITION',
    'ORIGINAL_JOURNAL_UNCHANGED_DURING_AUDIT',
    'ORIGINAL_STORAGE_TIMESTAMPS_PRESERVE_PROSPECTIVE_EVIDENCE',
  ];
  const states=['NO_ORIGINAL_FILL','FILL_NOT_YET_VERIFIABLE',
    'FILL_INVALID','FILL_RIGOROUS_REPLAY_VERIFIED'];
  // Only these fixed, non-sensitive forensic reason codes may leave Vercel.
  // Never publish the private evidence pathname, blob SHA, receipt or error.
  const safeMissing=new Set([
    'PRIVATE_READ_ONLY_EVIDENCE_ACCESS_REQUIRED',
    'ORIGINAL_JOURNAL_REQUIRED',
    'PRIVATE_EVIDENCE_READ_UNAVAILABLE',
    'PRIVATE_EVIDENCE_OBJECT_MISSING',
    'PRIVATE_EVIDENCE_ORIGIN_METADATA_REQUIRED',
    'PRIVATE_EVIDENCE_ORIGIN_METADATA_INVALID',
    'PRIVATE_EVIDENCE_ORIGINAL_READ_INVALID',
    'FIRST_FILL_MARKET_FORENSIC_ADAPTER_NOT_REVIEWED',
    'ORIGINAL_CBOE_FILE_DISCOVERY_REQUIRED',
    'ORIGINAL_JOURNAL_CHANGED_DURING_READ_ONLY_AUDIT',
    'ORIGINAL_STORAGE_OBJECT_TIMESTAMPS_REQUIRED',
    'SETTLEMENT_ARCHIVE_PRECOMMIT_TIMESTAMP_NOT_PROVEN',
    'PRIVATE_FORENSIC_CHECK_NOT_COMPLETED',
  ]);
  if(!r||!states.includes(r.state)||r.journalMutationAllowed!==false
    ||r.paperFillsCreated!==0||r.certifiedTrades!==0||r.phase9Credit!==0
    ||r.brokerConnectivityAllowed!==false||r.liveTradingAllowed!==false
    ||!Array.isArray(r.checks)||r.checks.length>allChecks.length
    ||!Array.isArray(r.missingEvidence)||r.missingEvidence.length>100
    ||!Array.isArray(r.defects)||r.defects.length>100)fail();
  const names=r.checks.map(c=>c?.name);
  if(r.checks.some(c=>c?.verified!==true||!allChecks.includes(c.name))
    ||new Set(names).size!==names.length
    ||names.some((n,i)=>allChecks[i]!==n))fail();
  const verified=r.state==='FILL_RIGOROUS_REPLAY_VERIFIED';
  if(verified&&(allChecks.some(x=>!names.includes(x))
    ||r.missingEvidence.length!==0||r.defects.length!==0))fail();
  const firstMissing=r.missingEvidence[0]?.code;
  const safeReason=r.state==='FILL_INVALID'?'FORENSIC_INTEGRITY_DEFECT'
    :r.state==='NO_ORIGINAL_FILL'?'NO_ORIGINAL_FILL'
    :r.state==='FILL_RIGOROUS_REPLAY_VERIFIED'?'NONE'
    :safeMissing.has(firstMissing)?firstMissing:'PRIVATE_EVIDENCE_GAP_UNCLASSIFIED';
  return {mode:'ONE_GLOBAL_FIRST_FILL_FORENSIC_SAFE_STATUS',state:r.state,
    forensicReasonCode:safeReason,
    nextRequiredCheck:allChecks[names.length]??null,
    firstFillForensicallyVerified:verified,checksPassed:names.length,
    originalJournalReplayed:names.includes('ORIGINAL_HASH_CHAIN_AND_ACCOUNT_REPLAY'),
    missingEvidenceCount:r.missingEvidence.length,defectCount:r.defects.length,
    journalMutationAllowed:false,paperFillsCreated:0,certifiedTrades:0,
    phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
}


/** Sanitize first, then render a human-readable Actions warning and run summary.
 * A green technical execution is never represented as a successful PAPER fill.
 * No secret, provider payload, owner identity, raw quote or journal hash enters
 * either log channel. Blocker names are strictly uppercase enum codes.
 */
export function oneGlobalActionsCycleSummary(rawReport){
  const report=publicOneGlobalCloudCycleReport(rawReport);
  const status=report.paperFillsCreated===1?'FILL_VERIFIED':
    report.settlementState==='SETTLEMENT_BLOCKED'&&report.pendingSignalCount>0
      ?'PAPER_BLOCKED':'NO_FILL';
  const descriptions={
    FILL_VERIFIED:'One new FILL is verified in the original private journal',
    PAPER_BLOCKED:'The run succeeded technically, but PAPER settlement is BLOCKED',
    NO_FILL:'The run succeeded technically; no new PAPER FILL was created',
  };
  const blockers=report.settlementBlockers.length?report.settlementBlockers.join(', '):'NONE';
  const outcomes=report.sourceOutcomes.length
    ?report.sourceOutcomes.map(x=>x.providerId+': '+x.state).join('; '):'NONE';
  const markdown=[
    '## FENICE ONE GLOBAL — original PAPER settlement',
    '',
    '**PAPER OUTCOME: '+status+'**',
    '',
    descriptions[status]+'.',
    '',
    '| Audited field | Value |',
    '|---|---|',
    '| Private journal verified | '+String(report.originalJournalVerified)+' |',
    '| Original events preserved | '+String(report.originalEventsPreserved)+' |',
    '| Journal events | '+report.journalEventCount+' |',
    '| Pending signals | '+report.pendingSignalCount+' |',
    ...(report.usAdmissibility?[
      '| US original admissibility | '+report.usAdmissibility.state+' |',
      '| US configured market mappings | '+report.usAdmissibility.configuredUsMarketMappings+' |',
      '| US original rights documents | '+report.usAdmissibility.originalUsUsageDocuments+' |',
      '| US admissibility blocker | '+(report.usAdmissibility.blocker??'NONE')+' |',
    ]:[]),
    '| New signals | '+report.newSignals+' |',
    ...(report.euSignalCycle?[
      '| European signal research | '+report.euSignalCycle.state+' |',
      '| European new SIGNALs | '+report.euSignalCycle.newSignals+' |',
      '| European candidates examined | '+report.euSignalCycle.sourcePairsAttempted+' |',
      '| EU next-session evidence | '+(report.euSignalCycle.rightsAndNextSessionEvidenceConnected?'CONNECTED':'NOT_CONFIRMED')+' |',
    ]:[]),
    '| Total verified FILLs | '+report.virtualFillCount+' |',
    '| New FILLs this cycle | '+report.paperFillsCreated+' |',
    '| Settlement state | '+report.settlementState+' |',
    '| Source requests attempted | '+report.settlementSourceRequests+' |',
    '| Owner PAPER consent checked | '+String(report.ownerPaperAuthorityValidated)+' |',
    '| Source rights checked for settlement | '+String(report.sourceRightsEvidenceValidated)+' |',
    '| Independent upstream checked | '+String(report.upstreamEvidenceValidated)+' |',
    '| Exchange session checked | '+String(report.exchangeSessionEvidenceValidated)+' |',
    '| Broker and LIVE trading | DISABLED |',
    '',
    '**Settlement blockers (safe reason codes):** '+blockers,
    '',
    '**Provider outcomes (safe reason codes):** '+outcomes,
    '',
    '_A successful GitHub job only confirms that this verification ran. It does not certify market execution or PAPER profitability._',
    '',
  ].join('\n');
  const annotation=status==='PAPER_BLOCKED'
    ?'::warning title=FENICE PAPER BLOCKED::No FILL. Settlement blockers: '+blockers
    :status==='NO_FILL'
      ?'::notice title=FENICE PAPER NOT EXECUTED::No new PAPER FILL. Settlement state: '+report.settlementState
      :'::notice title=FENICE PAPER FILL VERIFIED::Exactly one FILL added to the original private journal.';
  // An earlier CBA settlement blocker is independent of a newly archived
  // European SIGNAL. Report both, and never call the SIGNAL a FILL.
  const euAnnotation=report.euSignalCycle?.canonicalSignalCommitted
    ?'::notice title=FENICE EU SIGNAL RECORDED::Prospective EU SIGNAL written to original private journal; no FILL or trading authority implied.'
    :report.euSignalCycle?.state==='EU_OFFICIAL_SOURCE_PAIR_UNAVAILABLE'
      ?'::warning title=FENICE EU SIGNAL BLOCKED::Official EU source pair unavailable; no prospective EU SIGNAL recorded.'
      :null;
  return {report,status,markdown,annotation,euAnnotation};
}
