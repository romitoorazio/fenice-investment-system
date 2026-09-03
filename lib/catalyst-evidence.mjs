const GENERIC_NAME_TOKENS = new Set([
  'holding', 'holdings', 'company', 'corporation', 'corp', 'inc', 'limited', 'ltd',
  'group', 'plc', 'nv', 'sa', 'ag', 'se', 'technologies', 'technology',
]);

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value) {
  return new Set(normalize(value).split(/\s+/).filter(Boolean));
}

export function assetIdentityTokens(asset) {
  const symbol = normalize(asset?.symbol);
  const name = normalize(asset?.name);
  const nameTokens = name
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !GENERIC_NAME_TOKENS.has(token));
  return { symbol, nameTokens };
}

export function evidenceMatchesAsset(asset, evidence) {
  const textTokens = tokens(evidence);
  const { symbol, nameTokens } = assetIdentityTokens(asset);
  if (symbol && textTokens.has(symbol)) return true;
  return nameTokens.some((token) => textTokens.has(token));
}

export function sanitizeCatalyst(candidate) {
  const evidence = Array.isArray(candidate?.catalyst?.evidence) ? candidate.catalyst.evidence : [];
  const verified = evidence.filter((item) => evidenceMatchesAsset(candidate, item));
  const removed = evidence.length - verified.length;
  if (!removed) return { candidate, removed: 0 };

  const recentEvents = Math.min(Number(candidate.catalyst?.recentEvents || 0), verified.length);
  const matchedEvents = Math.min(Number(candidate.catalyst?.matchedEvents || 0), verified.length);
  const score = Math.max(48, Math.min(100, 48 + recentEvents * 7 + matchedEvents * 2));

  const bullCase = (candidate.bullCase || []).filter(
    (item) => !String(item).startsWith('Catalizzatori recenti verificati:'),
  );
  if (verified.length) {
    bullCase.push(`Catalizzatori recenti verificati: ${verified.join(' | ')}`);
  }

  return {
    removed,
    candidate: {
      ...candidate,
      scorecard: { ...candidate.scorecard, catalysts: score },
      catalyst: {
        ...candidate.catalyst,
        score,
        matchedEvents,
        recentEvents,
        evidence: verified,
      },
      bullCase,
    },
  };
}
