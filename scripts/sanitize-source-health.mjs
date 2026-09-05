import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const targets = [
  path.join(ROOT, 'data', 'global-source-health.json'),
  path.join(ROOT, 'data', 'source-history'),
];

const SENSITIVE_QUERY_PARAMS = new Set([
  'api_key',
  'apikey',
  'key',
  'token',
  'access_token',
]);

function redactUrl(value) {
  if (typeof value !== 'string' || !value) return value;
  try {
    const url = new URL(value);
    for (const key of SENSITIVE_QUERY_PARAMS) {
      if (url.searchParams.has(key)) url.searchParams.set(key, 'REDACTED');
    }
    return url.toString();
  } catch {
    return value.replace(
      /([?&](?:api_key|apikey|key|token|access_token)=)[^&\s]*/gi,
      '$1REDACTED',
    );
  }
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;

  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'endpointUsed' || key === 'endpoint' || key === 'url') {
      out[key] = redactUrl(entry);
    } else {
      out[key] = sanitize(entry);
    }
  }
  return out;
}

function jsonFiles(target) {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return target.endsWith('.json') ? [target] : [];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) return jsonFiles(child);
    return entry.isFile() && entry.name.endsWith('.json') ? [child] : [];
  });
}

let changed = 0;
let checked = 0;
for (const target of targets) {
  for (const file of jsonFiles(target)) {
    checked += 1;
    const before = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(before);
    const after = `${JSON.stringify(sanitize(parsed), null, 2)}\n`;
    if (after !== before) {
      fs.writeFileSync(file, after, 'utf8');
      changed += 1;
    }
  }
}

console.log(`Sanitized source-health artifacts: ${changed} changed / ${checked} checked.`);
