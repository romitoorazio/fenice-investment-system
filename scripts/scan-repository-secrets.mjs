import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const allowlistedFiles = new Set(['.env.example']);
const findings = [];

const rules = [
  {
    id: 'private-key',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  },
  {
    id: 'github-token',
    re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g,
  },
  {
    id: 'generic-secret-assignment',
    re: /\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret|client[_-]?secret|password)\b\s*[:=]\s*["']?([A-Za-z0-9_\-\.]{16,})["']?/gi,
  },
  {
    id: 'secret-query-param',
    re: /[?&](?:api[_-]?key|apikey|access[_-]?token|token|key|secret)=([^&\s"']{12,})/gi,
  },
];

function isSafeValue(value = '') {
  const normalized = value.trim();
  if (!normalized) return true;
  if (/^(?:REDACTED|MASKED|REMOVED|EXAMPLE|CHANGEME|YOUR[_-].*|DUMMY|PLACEHOLDER)$/i.test(normalized)) return true;
  if (/^\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}$/i.test(normalized)) return true;
  if (/^(?:process\.env\.|os\.environ|env\.)/i.test(normalized)) return true;
  return false;
}

for (const file of files) {
  if (allowlistedFiles.has(file)) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const rule of rules) {
    rule.re.lastIndex = 0;
    for (const match of text.matchAll(rule.re)) {
      const candidate = match[1] ?? match[0];
      if (isSafeValue(candidate)) continue;
      const line = text.slice(0, match.index).split('\n').length;
      findings.push({ file, line, rule: rule.id });
    }
  }
}

if (findings.length) {
  console.error('Repository secret scan FAILED. Potential credentials detected:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.rule}]`);
  }
  console.error('Secret values are intentionally not printed. Rotate any exposed credentials and remove them from repository history.');
  process.exit(1);
}

console.log(`Repository secret scan PASS (${files.length} tracked files checked).`);
