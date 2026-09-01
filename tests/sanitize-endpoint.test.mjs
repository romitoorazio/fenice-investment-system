import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeEndpoint, containsCredentialLikeQueryValue } from '../scripts/lib/sanitize-endpoint.mjs';

test('redacts common credential query parameters', () => {
  const input = 'https://example.test/data?function=STATUS&apikey=super-secret&x=1';
  const output = sanitizeEndpoint(input);
  assert.equal(output.includes('super-secret'), false);
  assert.equal(output.includes('apikey=REDACTED'), true);
  assert.equal(containsCredentialLikeQueryValue(output), false);
});

test('redacts provider secret even when parameter name is unusual', () => {
  const secret = 'abcd1234';
  const output = sanitizeEndpoint(`https://example.test/data?credential=${secret}`, { secrets: [secret] });
  assert.equal(output.includes(secret), false);
  assert.equal(output.includes('REDACTED'), true);
});

test('keeps placeholders safe', () => {
  const placeholder = 'https://example.test/data?api_key={key}';
  assert.equal(containsCredentialLikeQueryValue(placeholder), false);
});
