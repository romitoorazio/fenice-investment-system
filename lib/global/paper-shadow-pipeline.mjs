/** Read-only evidence gate -> virtual PAPER ledger. No data fetching, file writes or broker access. */
import {evaluateVenueCalendarEvidence} from "./venue-session-evidence.mjs";
import {evaluateInstrumentEvidence} from "./instrument-evidence.mjs";
import {appendVirtualFill} from "./virtual-ledger.mjs";
import {getVenue} from "./venue-registry.mjs";
export function runPaperShadow({ledger,identity,calendarObservation,quotes,fxEvidence,fill,nowIso}){
  const fail=reason=>({added:false,reason,ledger});
  const now=Date.parse(nowIso);
  if(!Number.isFinite(now)||!identity||!getVenue(identity.mic))return fail("INVALID_VENUE_OR_CLOCK");
  const calendar=evaluateVenueCalendarEvidence({mic:identity.mic,observation:calendarObservation,nowIso});
  if(!calendar.allowed)return fail(calendar.reason);
  const prices=evaluateInstrumentEvidence({mic:identity.mic,instrumentId:identity.instrumentId,session:calendar.session,quotes,nowIso});
  if(!prices.allowed)return fail(prices.reason);
  // The FX conversion must be an independently timestamped, sourced observation.
  const fxTime=Date.parse(fxEvidence?.observedAt??"");
  if(typeof fxEvidence?.sourceId!=="string"||!fxEvidence.sourceId.trim()||fxEvidence.base!==getVenue(identity.mic).currency||fxEvidence.quote!=="EUR"||!Number.isFinite(fxEvidence.rate)||fxEvidence.rate<=0||!Number.isFinite(fxTime)||fxTime>now||now-fxTime>120000)return fail("FX_EVIDENCE_INVALID_OR_STALE");
  if(fill?.fxToEur!==fxEvidence.rate)return fail("FX_FILL_MISMATCH");
  const fillTime=Date.parse(fill?.occurredAt??"");
  if(!Number.isFinite(fillTime)||fillTime>now||now-fillTime>120000||fillTime<Date.parse(calendarObservation.opensAt)||fillTime>=Date.parse(calendarObservation.closesAt))return fail("FILL_OUTSIDE_VERIFIED_WINDOW");
  try{return appendVirtualFill({ledger,identity,fill,evidence:prices});}
  catch(error){return fail(error.message||"PAPER_APPEND_REJECTED");}
}
