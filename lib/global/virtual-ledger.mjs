/** Fenice ONE GLOBAL: deterministic PAPER-only, append-only virtual event ledger. No I/O or broker calls. */
import {createHash} from "node:crypto";
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const iso=value=>typeof value==="string"&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const money=value=>typeof value==="number"&&Number.isFinite(value)&&value>=0;
export function paperIdempotencyKey({campaignId,mic,instrumentId,sessionDate,strategyVersion,signalId}){
  const fields=[campaignId,mic,instrumentId,sessionDate,strategyVersion,signalId];
  if(fields.some(v=>typeof v!=="string"||!v.trim())||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(sessionDate))throw Error("INVALID_PAPER_IDENTITY");
  return hash(fields);
}
function validIdentityKey(identity,key){
  try{return key===paperIdempotencyKey(identity);}catch{return false;}
}
export function replayVirtualLedger(ledger){
  if(ledger?.mode!=="FENICE_ONE_GLOBAL_VIRTUAL_ONLY"||ledger?.liveTradingAllowed!==false||ledger?.brokerConnectivityAllowed!==false||!Array.isArray(ledger.events))return {valid:false,reason:"LEDGER_SAFETY_INVALID"};
  const ids=new Set();let prevHash=null;
  for(const event of ledger.events){
    if(!event||event.kind!=="VIRTUAL_FILL"||event.prevHash!==prevHash||!iso(event.occurredAt)||!money(event.price)||event.price===0||!money(event.quantity)||event.quantity===0||!money(event.fees)||!money(event.fxToEur)||event.fxToEur===0||!["BUY","SELL"].includes(event.side)||typeof event.idempotencyKey!=="string"||ids.has(event.idempotencyKey)||!event.identity||!validIdentityKey(event.identity,event.idempotencyKey))return {valid:false,reason:"LEDGER_EVENT_INVALID"};
    const {hash:recorded,...payload}=event;
    if(recorded!==hash(payload))return {valid:false,reason:"LEDGER_HASH_INVALID"};
    if(event.identity.mic!==String(event.identity.instrumentId).split(":")[0])return {valid:false,reason:"LEDGER_INSTRUMENT_VENUE_MISMATCH"};
    ids.add(event.idempotencyKey);prevHash=recorded;
  }
  return {valid:true,reason:null,count:ids.size,lastHash:prevHash};
}
export function appendVirtualFill({ledger,identity,fill,evidence}){
  const audit=replayVirtualLedger(ledger);
  if(!audit.valid)throw Error(audit.reason);
  if(evidence?.allowed!==true||evidence?.venue!==identity?.mic||evidence?.instrumentId!==identity?.instrumentId)throw Error("PAPER_EVIDENCE_NOT_ELIGIBLE");
  if(identity.mic!==String(identity.instrumentId).split(":")[0])throw Error("PAPER_INSTRUMENT_VENUE_MISMATCH");
  const idempotencyKey=paperIdempotencyKey(identity);
  if(ledger.events.some(e=>e.idempotencyKey===idempotencyKey))return {ledger,added:false,reason:"DUPLICATE_PAPER_SIGNAL"};
  if(!iso(fill?.occurredAt)||!money(fill?.price)||fill.price===0||!money(fill?.quantity)||fill.quantity===0||!money(fill?.fees)||!money(fill?.fxToEur)||fill.fxToEur===0||!["BUY","SELL"].includes(fill.side))throw Error("INVALID_VIRTUAL_FILL");
  const payload={kind:"VIRTUAL_FILL",idempotencyKey,identity:{...identity},occurredAt:fill.occurredAt,side:fill.side,price:fill.price,quantity:fill.quantity,fees:fill.fees,fxToEur:fill.fxToEur,prevHash:audit.lastHash};
  const event={...payload,hash:hash(payload)};
  return {ledger:{...ledger,events:[...ledger.events,event]},added:true,reason:null};
}
