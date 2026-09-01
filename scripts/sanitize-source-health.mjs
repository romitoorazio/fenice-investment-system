import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const targets = [path.join(dataDir, 'global-source-health.json')];
const historyDir = path.join(dataDir, 'source-history');

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
    return value.replace(
      /([?&](?:api[_-]?key|key|token|access[_-]?token|secret|password)=)[^&#\s]+/gi,
      '$1[REDACTED]',
    );
  }
}

async function collectJson(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

targets.push(...await collectJson(historyDir));
let changed = 0;
let scanned = 0;

for (const file of targets) {
  try {
    if (!(await stat(file)).isFile()) continue;
    const raw = await readFile(file, 'utf8');
    const report = JSON.parse(raw);
    scanned += 1;
    let fileChanged = false;
    for (const source of report.sources || []) {
      const before = source.endpointUsed;
      const after = redactUrl(before);
      if (before !== after) {
        source.endpointUsed = after;
        fileChanged = true;
      }
    }
    if (fileChanged) {
      await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      changed += 1;
    }
  } catch (error) {
    console.error(`Unable to sanitize ${file}:`, error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

console.log(`Sanitized source metadata: scanned=${scanned}, changed=${changed}.`);
