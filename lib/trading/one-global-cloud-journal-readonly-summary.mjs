/**
 * Strict public log contract for the trusted GitHub OIDC read-only probe.
 * Never return original Blob bytes, instruments, hashes, ownership documents,
 * prices, source receipts, user credentials or journal version identifiers.
 */
const STATES=new Set([
  'ORIGINAL_JOURNAL_VALID_PRIVATE',
  'PRIVATE_STORE_NOT_CONFIGURED',
  'PRIVATE_STORE_READ_UNAVAILABLE',
  'ORIGINAL_JOURNAL_NOT_MIGRATED',
  'PRIVATE_STORE_SNAPSHOT_INVALID',
  'ORIGINAL_JOURNAL_REPLAY_INVALID',
]);
const count=x=>Number.isSafeInteger(x)&&x>=0?x:null;
export function publicOneGlobalJournalReadOnlySummary(report){
  const state=STATES.has(report?.state)?report.state:'PRIVATE_JOURNAL_STATUS_UNAVAILABLE';
  const counts=['journalEventCount','pendingSignalCount','virtualBuyCount','virtualSellCount']
    .map(key=>count(report?.[key]));
  const windows=[count(report?.signalWindows?.withinRegularWindowCount),
    count(report?.signalWindows?.elapsedRegularWindowCount)];
  const validated=state==='ORIGINAL_JOURNAL_VALID_PRIVATE'
    &&counts.every(v=>v!==null)&&windows.every(v=>v!==null);
  return {
    state:state==='ORIGINAL_JOURNAL_VALID_PRIVATE'&&!validated
      ?'PRIVATE_JOURNAL_STATUS_UNAVAILABLE':state,
    originalJournalValid:validated,
    journalEventCount:validated?counts[0]:null,
    pendingSignalCount:validated?counts[1]:null,
    virtualBuyCount:validated?counts[2]:null,
    virtualSellCount:validated?counts[3]:null,
    withinRegularWindowCount:validated?windows[0]:null,
    elapsedRegularWindowCount:validated?windows[1]:null,
    journalMutationAllowed:false,
    brokerConnectivityAllowed:false,
    liveTradingAllowed:false,
  };
}
