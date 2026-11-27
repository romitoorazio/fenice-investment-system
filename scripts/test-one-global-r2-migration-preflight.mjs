import assert from 'node:assert/strict';
import {ROOT,LEDGER,prepareR2Migration,reconcileInventory,sha256} from '../lib/trading/one-global-r2-migration-preflight.mjs';
import {syntheticInventory} from './fixtures/one-global-r2-migration.mjs';

const {manifest,objects}=syntheticInventory();
const check=(m,o,code)=>assert.equal(prepareR2Migration({manifest:m,objects:o}).state,'MIGRATION_'+code);
const changed=(index,patch)=>manifest.map((row,i)=>i===index?{...row,...patch}:row);
const {ledger,objectCount}=reconcileInventory(manifest,objects);
assert.equal(ledger.events.length,1);
assert.equal(objectCount,4);
check(manifest,objects,'HISTORY_MISMATCH'); // Positive synthetic replay cannot authorize the authentic history.
check(null,objects,'INVENTORY_INVALID');
check(manifest.slice(1),objects.slice(1),'REQUIRED_OBJECT_MISSING');
check(manifest.slice(0,2),objects.slice(0,2),'REFERENCED_OBSERVATION_MISSING');
check(manifest.slice(0,3),objects.slice(0,3),'REFERENCED_RAW_MISSING');
check(changed(0,{key:manifest[1].key}),objects,'MANIFEST_INVALID');
check(manifest,[objects[1],...objects.slice(1)],'OBJECT_INVALID');
check(manifest,[{key:LEDGER,bytes:Buffer.alloc(manifest[0].size)},...objects.slice(1)],'BYTES_MISMATCH');
for(const key of [ROOT+'../escape',ROOT+'%2e%2e',ROOT+'arbitrary.json',ROOT+'observations/raw/a','https://private.invalid'])
  check(changed(0,{key}),objects,'MANIFEST_INVALID');
for(const bad of [{sourceUploadedAt:'2026-02-30T12:00:00.000Z'},{sourceUploadedAt:'yesterday'},
  {size:0},{size:1_500_001},{size:1.5},{sha256:'x'.repeat(64)}])check(changed(0,bad),objects,'MANIFEST_INVALID');
for(const [index,bytes,code] of [[0,Buffer.from('{}'),'HISTORY_MISMATCH'],[0,Buffer.from([255]),'INVALID_JSON_OBJECT'],
  [1,Buffer.from('{}'),'ORIGINAL_CONTEXT_INVALID'],[3,Buffer.from('other raw'),'RAW_FINGERPRINT_MISMATCH']]){
  check(changed(index,{size:bytes.length,sha256:sha256(bytes)}),objects.map((o,i)=>i===index?{...o,bytes}:o),code);
}
const obs=JSON.parse(objects[2].bytes);
function replacedPacket(packet,code){
  const bytes=Buffer.from(JSON.stringify(packet));
  check(changed(2,{size:bytes.length,sha256:sha256(bytes)}),objects.map((o,i)=>i===2?{...o,bytes}:o),code);
}
replacedPacket({...obs,kind:'ONE_GLOBAL_PRIVATE_SOURCE_ACCESS_OBSERVATION'},'SIGNAL_ARCHIVE_KIND_MISMATCH');
replacedPacket({...obs,receipts:[{receipt:{payloadSha256:sha256('xxx')},rawBase64:'eA=='}]},'INLINE_PAYLOAD_MISMATCH');
replacedPacket({...obs,receipts:[{receipt:{payloadSha256:sha256('x')},rawBase64:'eA'}]},'INLINE_PAYLOAD_MISMATCH');
// A non-EUR settlement must include authentic ECB bytes even if both FX fields are absent.
function checkSettlementFx(currency,fxFields,expected){
  const payload=Buffer.from('synthetic-provider');
  const packet={kind:'ONE_GLOBAL_PRIVATE_SETTLEMENT_SOURCE_OBSERVATION',
    marketEvidence:{providerReceipts:[{providerId:'test-provider',currency,payloadSha256:sha256(payload)}]},
    providerRaw:[{providerId:'test-provider',rawBase64:payload.toString('base64')}],...fxFields};
  const bytes=Buffer.from(JSON.stringify(packet));
  const key=ROOT+'observations/'+sha256(bytes)+'.json';
  const m=[...manifest,{key,size:bytes.length,sha256:sha256(bytes),sourceUploadedAt:manifest[0].sourceUploadedAt}];
  const o=[...objects,{key,bytes}];
  if(expected)check(m,o,expected);
  else assert.equal(reconcileInventory(m,o).objectCount,5);
}
const ecb=Buffer.from('synthetic-ecb');
const validFx={ecbRawBase64:ecb.toString('base64'),fxEvidence:{ecbResponseSha256:sha256(ecb)}};
checkSettlementFx('USD',{},'INLINE_PAYLOAD_INVALID');
checkSettlementFx('USD',{fxEvidence:validFx.fxEvidence},'INLINE_PAYLOAD_INVALID');
checkSettlementFx('USD',{...validFx,ecbRawBase64:'eA=='},'INLINE_PAYLOAD_MISMATCH');
checkSettlementFx('USD',validFx);
checkSettlementFx('EUR',{});
const result=prepareR2Migration({manifest,objects,authorized:true,sourceProvenanceIndependentlyVerified:true});
for(const key of ['sourceProvenanceIndependentlyVerified','completeInventoryIndependentlyVerified','journalMutationAllowed',
  'authoritativeStoreChanged','brokerConnectivityAllowed','liveTradingAllowed'])assert.equal(result[key],false);
console.log('PASS isolated migration inventory, byte integrity, metadata, replay, references and provenance boundaries');
