import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = JSON.parse(await readFile(path.join(root, 'data', 'strategy-lab.json'), 'utf8'));
const assets = Array.isArray(report.assets) ? report.assets : [];
const robustCount = assets.filter((asset) => asset?.conclusion === 'ROBUSTA').length;
const expectedDetail = `${assets.length}/${Number(report.universeSize || assets.length)} strumenti analizzati; ${robustCount} con almeno una famiglia classificata ROBUSTA.`;

assert.equal(report.assetCount, assets.length, 'assetCount must match the persisted asset set');
assert.equal(report.robustCount, robustCount, 'robustCount must be derived from final persisted conclusions');
assert.equal(report.source?.detail, expectedDetail, 'source detail must describe the finalized report, not the pre-finalization result');

console.log('Fenice strategy report summary consistency: PASS');
