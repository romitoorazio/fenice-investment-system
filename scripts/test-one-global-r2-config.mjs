import assert from 'node:assert/strict';
import {resolvePrivateR2Config} from '../lib/trading/one-global-r2-config.mjs';
const env={R2_ACCESS_KEY_ID:'test-id',R2_SECRET_ACCESS_KEY:'test-secret',R2_ENDPOINT:'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',R2_BUCKET_NAME:'fenice-private-storage'};
assert.equal(resolvePrivateR2Config(env).region,'auto');
assert.throws(()=>resolvePrivateR2Config({}),/R2_CONFIGURATION_INCOMPLETE/);
for(const endpoint of ['http://example.com','https://example.com','https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/path','https://user@0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com'])assert.throws(()=>resolvePrivateR2Config({...env,R2_ENDPOINT:endpoint}),/R2_ENDPOINT_INVALID/);
assert.throws(()=>resolvePrivateR2Config({...env,R2_BUCKET_NAME:'other'}),/R2_BUCKET_INVALID/);
console.log('R2 configuration tests passed');
