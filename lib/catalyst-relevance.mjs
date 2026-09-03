const GENERIC_TOKENS = new Set([
  'holding', 'holdings', 'company', 'companies', 'corporation', 'corp', 'limited', 'group',
  'technology', 'technologies', 'systems', 'industries', 'international', 'global',
  'semiconductor', 'semiconductors', 'manufacturing', 'energy', 'financial', 'healthcare',
  'resources', 'capital', 'markets', 'solutions', 'services', 'incorporated',
]);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasWholeToken(text, token) {
  if (!token) return false;
  return new RegExp(`(?:^|\\s)${escapeRegex(token)}(?:$|\\s)`, 'i').test(text);
}

export function distinctiveAssetTokens(asset) {
  const symbol = normalize(asset?.symbol).replaceAll(' ', '');
  const nameTokens = normalize(asset?.name)
    .split(/\s+/)
    .filter((token) => token.length >= 5 && !GENERIC_TOKENS.has(token) && token !== symbol);
  return [...new Set(nameTokens)];
}

export function isCatalystRelevant(asset, item) {
  const text = normalize(`${item?.name || ''} ${item?.signal || ''} ${item?.source || ''}`);
  if (!text) return false;

  const symbol = normalize(asset?.symbol).replaceAll(' ', '');
  if (symbol.length >= 3 && hasWholeToken(text, symbol)) return true;

  const normalizedName = normalize(asset?.name);
  if (normalizedName.length >= 8 && text.includes(normalizedName)) return true;

  const tokens = distinctiveAssetTokens(asset);
  return tokens.some((token) => hasWholeToken(text, token));
}
