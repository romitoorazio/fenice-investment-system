/** Read-only evidence gate -> virtual PAPER ledger. No data fetching, file writes or broker access. */
import {evaluateVenueCalendarEvidence} from "./venue-session-evidence.mjs";
import {evaluateInstrumentEvidence} from "./instrument-evidence.mjs";
import {appendVirtualFill} from "./virtual-ledger.mjs";
import {getVenue} from "./venue-registry.mjs";
import {evaluateFxConsensus} from "./fx-consensus.mjs";
export function runPaperShadow({ledger,identity,calendarObservation,quotes,fxEvidence,fxObservations,fill,nowIso}){
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
  const consensus=evaluateFxConsensus({base:getVenue(identity.mic).currency,observations:fxObservations,nowIso});
  if(!consensus.allowed)return fail(consensus.reason);
  if(Math.abs(consensus.rate-fxEvidence.rate)>Math.max(1e-12,consensus.rate*1e-8))return fail("FX_CONSENSUS_MISMATCH");
  if(fill?.fxToEur!==fxEvidence.rate)return fail("FX_FILL_MISMATCH");
  // A synthetic fill must be priced inside the observed executable quote envelope.
  // Reject arbitrary favorable prices that could manufacture PAPER profits.
  const eligibleQuotes=quotes.filter(q=>q?.mic===identity.mic&&q?.instrumentId===identity.instrumentId&&q?.currency===getVenue(identity.mic).currency&&Number.isFinite(q.bid)&&Number.isFinite(q.ask)&&q.bid>0&&q.ask>=q.bid&&Number.isFinite(Date.parse(q.observedAt))&&Date.parse(q.observedAt)<=now&&now-Date.parse(q.observedAt)<=120000);
  const minBid=Math.min(...eligibleQuotes.map(q=>q.bid));
  const maxAsk=Math.max(...eligibleQuotes.map(q=>q.ask));
  if(!Number.isFinite(fill?.price)||fill.price<minBid||fill.price>maxAsk)return fail("FILL_PRICE_OUTSIDE_QUOTES");
  // Prevent attribution of a fill to another session day (including timezone rollover).
  const rawFillTime=Date.parse(fill?.occurredAt??"");
  if(!Number.isFinite(rawFillTime))return fail("FILL_OUTSIDE_VERIFIED_WINDOW");
  const dayParts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:getVenue(identity.mic).zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(rawFillTime)).filter(p=>["year","month","day"].includes(p.type)).map(p=>[p.type,p.value]));
  const venueDay=`${dayParts.year}-${dayParts.month}-${dayParts.day}`;
  if(venueDay!==identity.sessionDate)return fail("FILL_SESSION_DATE_MISMATCH");
  const fillTime=Date.parse(fill?.occurredAt??"");
  if(!Number.isFinite(fillTime)||fillTime>now||now-fillTime>120000||fillTime<Date.parse(calendarObservation.opensAt)||fillTime>=Date.parse(calendarObservation.closesAt))return fail("FILL_OUTSIDE_VERIFIED_WINDOW");
  try{return appendVirtualFill({ledger,identity,fill,evidence:prices});}
  catch(error){return fail(error.message||"PAPER_APPEND_REJECTED");}
}
