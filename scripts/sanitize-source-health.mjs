import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'data', 'global-source-health.json');
const report = JSON.parse(await readFile(file, 'utf8'));

function redactUrl(value) {
  if (!value || typeof value !== 'string') return value;
  try {
    const url = new URL(value);
    const sensitive = /^(api[_-]?key|key|token|access[_-]?token|secret|password)$/i;
    for (const name of [...url.searchParams.keys()]) {
      if (sensitive.test(name)) url.searchParams.set(name, '[REDACTED]');
    }
    return url.toString();
  } catch {
    return value
      .replace(/([?&](?:api[_-]?key|key|token|access[_-]?token|secret|password)=)[^&#\s]+/gi, '$1[REDACTED]');
  }
}

for (const source of report.sources || []) {
  source.endpointUsed = redactUrl(source.endpointUsed);
}

await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('Sanitized persisted source-health endpoints.');
