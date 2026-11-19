/**
 * Exact private Blob observation chronology for FUTURE ONE GLOBAL SIGNALs.
 *
 * The original journal and older observations are immutable. No timestamps
 * are guessed, rounded, tolerated, backdated or obtained from HTTP Last-Modified.
 * This guard neither attests market-data rights nor enables LIVE brokerage.
 */
const fail=code=>{throw Error('CLOUD_SIGNAL_ORIGIN_'+code);};
const iso=x=>typeof x==='string'
  &&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)
  &&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const exactTimestamp=value=>{
  if(value instanceof Date)return Number.isFinite(value.getTime())?value.toISOString():null;
  return typeof value==='string'&&iso(value)?value:null;
};
/** Check the exact private evidence bytes and provider control-plane HEAD. */
export async function verifyOneGlobalPrecommitSignalArchive({storage,hash,body,clock}={}){
  if(typeof storage?.readResearchObservation!=='function'
    ||typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)
    ||typeof body!=='string'||Buffer.byteLength(body,'utf8')<20
    ||Buffer.byteLength(body,'utf8')>1_500_000||typeof clock!=='function')
    fail('ORIGINAL_PRIVATE_ORIGIN_READER_REQUIRED');
  let packet;
  try{packet=await storage.readResearchObservation(hash);}
  catch{fail('ORIGINAL_PRIVATE_ORIGIN_READ_FAILED');}
  if(!Buffer.isBuffer(packet?.body)||packet.body.toString('utf8')!==body
    ||!packet.body.equals(Buffer.from(body,'utf8')))
    fail('ORIGINAL_ARCHIVED_BYTES_MISMATCH');
  if(packet.uploadedAtSource!=='VERCEL_CONTROL_PLANE_HEAD')
    fail('ORIGINAL_CONTROL_PLANE_HEAD_REQUIRED');
  const uploadedAt=exactTimestamp(packet.uploadedAt);
  if(!uploadedAt)fail('ORIGINAL_CONTROL_PLANE_TIMESTAMP_INVALID');
  assertOneGlobalSignalClockAfterArchive({uploadedAt,recordedAt:clock()});
  return {uploadedAt};
}
/**
 * Check the actual transaction clock AGAIN inside the journal CAS callback.
 * A local clock reversal is a refusal, not permission to manufacture a FILL.
 */
export function assertOneGlobalSignalClockAfterArchive({uploadedAt,recordedAt}={}){
  if(!iso(uploadedAt)||!iso(recordedAt))fail('ORIGINAL_CLOCK_INVALID');
  if(Date.parse(recordedAt)<Date.parse(uploadedAt))
    fail('ORIGINAL_ARCHIVE_LATER_THAN_SIGNAL_CLOCK');
}
