import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditOneGlobalEodPilotSignalWindow as audit} from "../lib/trading/one-global-eod-pilot-time-audit.mjs";

const witness=JSON.parse(readFileSync("data/one-global-first-paper-cba-signal-witness.json","utf8"));
const cba=audit({mic:witness.exchangeMic,referenceSessionDate:witness.researchBarSession,
 referenceCloseAt:witness.researchCloseAt,referencePublishedAt:witness.researchPublishedAt,
 recordedAt:witness.decisionRecordedAt});
assert.equal(cba.status,"PROVISIONAL_PROSPECTIVE_WINDOW_OK");
assert.equal(cba.recordedExchangeLocalDate,"2026-11-13");
assert.equal(cba.recordedExchangeLocalClock,"01:14");
assert.equal(cba.firstNextNormalWeekday,"2026-11-13");
assert.equal(cba.regularOpenLocal,"10:00");
assert.equal(cba.paperFillEligible,false);
assert.equal(cba.independentSessionProof,false);
assert.equal(cba.phase9Credit,0);
assert.equal(cba.liveTradingAllowed,false);

// The 15:36 Milan pilot timestamp cannot be a completed 12 Nov EOD
// signal. If the reference is 11 Nov, it is already AFTER the first
// normal next-session opening (12 Nov 09:00). These are time-only
// fixtures; not a disclosure or re-creation of the private BAMI ledger.
const lateMilan="2026-11-12T14:36:22.791Z";
const afterPriorClose=audit({mic:"XMIL",referenceSessionDate:"2026-11-11",
 referenceCloseAt:"2026-11-11T16:40:00.000Z",
 referencePublishedAt:"2026-11-11T17:10:00.000Z",
 recordedAt:lateMilan});
assert.equal(afterPriorClose.status,"DECISION_AFTER_NEXT_NORMAL_SESSION_OPEN_OR_UNVERIFIED_HOLIDAY");
assert.equal(afterPriorClose.recordedExchangeLocalClock,"15:36");
assert.equal(afterPriorClose.eligibleBySchedule,false);
const beforeSameClose=audit({mic:"XMIL",referenceSessionDate:"2026-11-12",
 referenceCloseAt:"2026-11-12T16:36:00.000Z",
 referencePublishedAt:"2026-11-12T16:37:00.000Z",
 recordedAt:lateMilan});
assert.equal(beforeSameClose.status,"REFERENCE_DATE_OR_PUBLICATION_INVALID");
const preCloseMilan=audit({mic:"XMIL",referenceSessionDate:"2026-11-12",
 referenceCloseAt:"2026-11-12T13:45:00.000Z",
 referencePublishedAt:"2026-11-12T14:00:00.000Z",
 recordedAt:lateMilan});
assert.equal(preCloseMilan.status,"DECISION_BEFORE_REFERENCE_SESSION_END");
const regularPostClose=audit({mic:"XMIL",referenceSessionDate:"2026-11-12",
 referenceCloseAt:"2026-11-12T16:30:00.000Z",
 referencePublishedAt:"2026-11-12T17:00:00.000Z",
 recordedAt:"2026-11-12T18:10:00.000Z"});
assert.equal(regularPostClose.eligibleBySchedule,true);
const friToMon=audit({mic:"XMIL",referenceSessionDate:"2026-11-13",
 referenceCloseAt:"2026-11-13T16:30:00.000Z",
 referencePublishedAt:"2026-11-13T17:00:00.000Z",
 recordedAt:"2026-11-13T18:10:00.000Z"});
assert.equal(friToMon.firstNextNormalWeekday,"2026-11-16");
assert.equal(friToMon.eligibleBySchedule,true);
const unknown=audit({mic:"XHKG",referenceSessionDate:"2026-11-12",
 referenceCloseAt:"2026-11-12T16:30:00.000Z",
 referencePublishedAt:"2026-11-12T17:00:00.000Z",
 recordedAt:"2026-11-12T18:10:00.000Z"});
assert.equal(unknown.eligibleBySchedule,false);
assert.throws(()=>audit({mic:"XMIL",referenceSessionDate:"2026-11-12",
 referenceCloseAt:"2026-11-12T16:30:00.000Z",
 referencePublishedAt:"2026-11-12T17:00:00.000Z",
 recordedAt:"invalid"}),/EOD_PILOT_TIMING_INVALID_INPUT/);
console.log("PASS public CBA time window; Milan intraday pre-close and after-next-open cases rejected by audit; no private ledger, price, PAPER fill or Directa.");
