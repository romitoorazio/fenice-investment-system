const GENERIC_NAME_TOKENS = new Set([
  'holding', 'holdings', 'company', 'companies', 'corporation', 'corp', 'incorporated',
  'limited', 'group', 'plc', 'ltd', 'sa', 'nv', 'ag', 'spa', 'technology', 'technologies',
  'semiconductor', 'semiconductors', 'energy', 'international', 'global', 'systems', 'system',
]);

const words = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .split(/\s+/)
  .filter(Boolean);

export function evidenceMatchesAsset(asset, evidence) {
  const evidenceWords = words(evidence);
  if (!evidenceWords.length) return false;
  const evidenceSet = new Set(evidenceWords);
  const symbol = String(asset?.symbol || '').toLowerCase().trim();
  if (symbol && evidenceSet.has(symbol)) return true;

  const distinctive = words(asset?.name)
    .filter((token) => token.length >= 5 && !GENERIC_NAME_TOKENS.has(token));
  if (!distinctive.length) return false;

  const hits = distinctive.filter((token) => evidenceSet.has(token));
  if (distinctive.length === 1) return hits.length === 1;
  return hits.length >= 2 || (hits.length === 1 && distinctive[0] === hits[0] && distinctive[0].length >= 8);
}

export function sanitizeCatalystDecision(decision) {
  if (!decision || typeof decision !== 'object') return decision;
  const evidence = Array.isArray(decision.catalyst?.evidence) ? decision.catalyst.evidence : [];
  const relevant = evidence.filter((item) => evidenceMatchesAsset(decision, item));

  if (decision.catalyst) {
    decision.catalyst.evidence = relevant;
    if (relevant.length === 0) {
      decision.catalyst.matchedEvents = 0;
      decision.catalyst.recentEvents = 0;
      decision.catalyst.score = Math.min(Number(decision.catalyst.score || 48), 48);
      if (decision.scorecard) decision.scorecard.catalysts = decision.catalyst.score;
    } else {
      decision.catalyst.recentEvents = Math.min(Number(decision.catalyst.recentEvents || relevant.length), relevant.length);
      decision.catalyst.matchedEvents = Math.max(relevant.length, Number(decision.catalyst.recentEvents || 0));
    }
  }

  if (Array.isArray(decision.bullCase) && relevant.length === 0) {
    decision.bullCase = decision.bullCase.filter((item) => !String(item).startsWith('Catalizzatori recenti verificati:'));
  }
  return decision;
}
