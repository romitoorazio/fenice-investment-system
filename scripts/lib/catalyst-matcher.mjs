const GENERIC_NAME_TOKENS = new Set([
  'company', 'corporation', 'corp', 'incorporated', 'limited', 'holding', 'holdings',
  'group', 'technologies', 'technology', 'systems', 'international', 'global', 'plc',
]);

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function catalystMatchesAsset(asset, item) {
  const rawText = `${item?.name || ''} ${item?.signal || ''}`;
  const text = normalize(rawText);
  if (!text) return false;

  const symbol = normalize(asset?.symbol).replace(/\s+/g, '');
  if (symbol.length >= 2) {
    const symbolPattern = new RegExp(`(?:^|\\s)${escapeRegex(symbol)}(?:$|\\s)`, 'i');
    if (symbolPattern.test(text)) return true;
  }

  const nameTokens = normalize(asset?.name)
    .split(/\s+/)
    .filter((token) => token.length >= 5 && !GENERIC_NAME_TOKENS.has(token));

  if (!nameTokens.length) return false;

  const matched = nameTokens.filter((token) => new RegExp(`(?:^|\\s)${escapeRegex(token)}(?:$|\\s)`, 'i').test(text));

  // A single distinctive brand token (e.g. nvidia, crowdstrike) is enough.
  if (nameTokens.length === 1) return matched.length === 1;

  // For multi-word corporate names require two independent informative tokens.
  // This prevents false positives such as TSM matching the substring in "measurement".
  return matched.length >= 2;
}

export function matchCatalysts(asset, discoveries = []) {
  return discoveries.filter((item) => catalystMatchesAsset(asset, item));
}
