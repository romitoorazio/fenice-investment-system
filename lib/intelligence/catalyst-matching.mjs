const GENERIC_NAME_TOKENS = new Set([
  "company",
  "corporation",
  "corp",
  "group",
  "holding",
  "holdings",
  "inc",
  "incorporated",
  "limited",
  "plc",
]);

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function exactTokenPattern(token) {
  const escaped = normalize(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped ? new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i") : null;
}

export function catalystMatchesAsset(asset, discovery) {
  const text = normalize(`${discovery?.name || ""} ${discovery?.signal || ""}`);
  if (!text) return false;

  const symbolPattern = exactTokenPattern(asset?.symbol);
  if (symbolPattern?.test(text)) return true;

  const primaryNameToken = normalize(asset?.name)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 5 && !GENERIC_NAME_TOKENS.has(token))
    .at(0);

  return Boolean(primaryNameToken && exactTokenPattern(primaryNameToken)?.test(text));
}
