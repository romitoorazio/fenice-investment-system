/**
 * Private owner-only read model for the ORIGINAL forward PAPER journal.
 * A pending hash-chain SIGNAL is NOT necessarily executable: the strict
 * immediately-next-session 48h evidence window can already have elapsed.
 * No writes, no provider requests and no market price / position disclosure.
 */
import {replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';
import {
  auditOneGlobalEodPilotSignalWindow,
  oneGlobalRegularNextSessionCutoff,
} from './one-global-eod-pilot-time-audit.mjs';

export const ORIGINAL_CBA_SIGNAL_ID='fenice-eod-cba-australia-20261112-pilot-001';
export const ORIGINAL_CBA_SIGNAL_HASH='c590a9f044eba8a1ce58cc7b0fb0dd6b7a8e21b4ad4000a0c27f6a7c9d8d8817';

export function assessOneGlobalPrivatePendingWindows({ledger,nowIso}={}){
  const now=Date.parse(nowIso);
  if(typeof nowIso!=='string'||!Number.isFinite(now)
    ||new Date(now).toISOString()!==nowIso)
    throw Error('EOD_PRIVATE_WINDOW_INVALID_WALL_CLOCK');
  const replay=replayOneGlobalEodPaperLedger(ledger);
  const pending=new Set(replay.pendingSignals);
  const latest=new Map();
  for(const e of ledger.events)
    if(e.kind==='SIGNAL'&&pending.has(e.key))latest.set(e.key,e);
  let withinWindow=0,elapsed=0,unverified=0;
  let cbaPilot=null;
  for(const signal of latest.values()){
    const timing=auditOneGlobalEodPilotSignalWindow({
      mic:signal.mic,referenceSessionDate:signal.referenceSessionDate,
      referenceCloseAt:signal.referenceCloseAt,
      referencePublishedAt:signal.referencePublishedAt,
      recordedAt:signal.recordedAt,
    });
    const cutoff=oneGlobalRegularNextSessionCutoff({
      mic:signal.mic,referenceSessionDate:signal.referenceSessionDate,
    });
    if(timing.eligibleBySchedule!==true||!cutoff){
      unverified++;
      continue;
    }
    const hasElapsed=now>Date.parse(cutoff.evidenceDeadlineAt);
    if(hasElapsed)elapsed++;else withinWindow++;
    if(signal.key==='XASX:CBA'&&signal.signalId===ORIGINAL_CBA_SIGNAL_ID
      &&signal.hash===ORIGINAL_CBA_SIGNAL_HASH
      &&signal.referenceSessionDate==='2026-11-12'
      &&cutoff.targetSessionDate==='2026-11-13'){
      cbaPilot={
        state:hasElapsed?'REGULAR_48H_EVIDENCE_WINDOW_ELAPSED':
          'AWAITING_NEXT_SESSION_RECEIPTS_WITHIN_48H',
        nextRegularSessionDate:cutoff.targetSessionDate,
        evidenceDeadlineAt:cutoff.evidenceDeadlineAt,
        ownerManualRetirementAvailable:hasElapsed,
        privateJournalStillPending:true,
        paperFillProven:false,
        brokerConnectivityAllowed:false,liveTradingAllowed:false,
      };
    }
  }
  return {
    pendingSignalCount:pending.size,withinRegularWindowCount:withinWindow,
    elapsedRegularWindowCount:elapsed,calendarOrWindowNotVerifiedCount:unverified,
    pendingCbaPilot:cbaPilot,
    // An ordinary weekday calendar estimate never certifies exchange sessions.
    exchangeCalendarIndependentlyCertified:false,
    sourcesAndRightsIndependentlyVerified:false,
    anyAutomaticJournalChange:false,
    phase9Credit:0,liveTradingAllowed:false,brokerConnectivityAllowed:false,
  };
}
