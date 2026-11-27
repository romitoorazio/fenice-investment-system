/** Explicit R2 prospective runtime ordering. Never a legacy provider timestamp. */
import {createHash} from 'node:crypto';
import {assertR2ProspectiveClockAfterReadback} from './one-global-r2-prospective-paper-store.mjs';
import {verifyOneGlobalPrecommitSignalArchive,assertOneGlobalSignalClockAfterArchive} from './one-global-private-signal-origin-proof.mjs';
const fail=()=>{throw Error('R2_PROSPECTIVE_CAMPAIGN_PROOF_INVALID');};
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
export const isR2Prospective=storage=>storage?.campaignKind==='R2_PROSPECTIVE_UNCERTIFIED';
export function assertProspectiveSnapshot(storage,snapshot){
  if(!isR2Prospective(storage))return false;
  if(typeof storage.verifyProspectivePrecommitObservation!=='function'||!iso(snapshot?.startedAt)
    ||typeof snapshot.originId!=='string'||! /^[a-f0-9-]{36}$/.test(snapshot.originId))fail();
  return true;
}
export async function verifyCycleSignalArchive({storage,hash,body,clock,snapshot}){
  if(!isR2Prospective(storage))return verifyOneGlobalPrecommitSignalArchive({storage,hash,body,clock});
  assertProspectiveSnapshot(storage,snapshot);
  const proof=await storage.verifyProspectivePrecommitObservation({hash,body});
  if(proof?.originId!==snapshot.originId||proof?.observationSha256!==createHash('sha256').update(body).digest('hex')
    ||proof.readbackObservedAt<snapshot.startedAt)fail();
  assertR2ProspectiveClockAfterReadback({proof,recordedAt:clock()});
  return proof;
}
export function assertCycleSignalArchiveClock({storage,origin,recordedAt,snapshot}){
  if(!isR2Prospective(storage))return assertOneGlobalSignalClockAfterArchive({uploadedAt:origin.uploadedAt,recordedAt});
  assertProspectiveSnapshot(storage,snapshot);
  if(origin?.originId!==snapshot.originId||origin.readbackObservedAt<snapshot.startedAt)fail();
  return assertR2ProspectiveClockAfterReadback({proof:origin,recordedAt});
}
