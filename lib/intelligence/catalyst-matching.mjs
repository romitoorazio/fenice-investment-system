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

function escapePattern(value) {
  return String(value || "").replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");
}

function exactTokenPattern(token) {
  const escaped = escapePattern(normalize(token));
  return escaped ? new RegExp("(^|[^a-z0-9])" + escaped + "([^a-z0-9]|$)", "i") : null;
}

function exactTickerPattern(symbol) {
  const ticker = String(symbol || "").trim().toUpperCase();
  const escaped = escapePattern(ticker);
  return escaped ? new RegExp("(^|[^A-Za-z0-9])" + escaped + "([^A-Za-z0-9]|$)") : null;
}

export function catalystMatchesAsset(asset, discovery) {
  const rawText = String(discovery?.name || "") + " " + String(discovery?.signal || "");
  const text = normalize(rawText);
  if (!text) return false;

  const symbolPattern = exactTickerPattern(asset?.symbol);
  if (symbolPattern?.test(rawText)) return true;

  const primaryNameToken = normalize(asset?.name)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 5 && !GENERIC_NAME_TOKENS.has(token))
    .at(0);

  return Boolean(primaryNameToken && exactTokenPattern(primaryNameToken)?.test(text));
}
