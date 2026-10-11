/**
 * Conservative post-generation guard: LLM output is NEVER authoritative.
 * If a generated explanation contains a new trading recommendation, invented
 * money/return claim or unsupported evidence path, reject the WHOLE text.
 * This is heuristic defense-in-depth, not proof that prose is true.
 */
export type ExplanationEvidence = {
  paragraphs: string[];
  blockers: string[];
  evidence: Array<{ source: string; value: string }>;
};

export type ExplanationSafetyVerdict =
  | { accepted: true; reason: "SUPPORTED_CLAIMS" }
  | { accepted: false; reason: "UNAUTHORIZED_TRADE" | "CLAIMED_EXECUTION" | "UNSUPPORTED_NUMERIC_CLAIM" | "UNSUPPORTED_SOURCE" };

function simplify(text: string): string {
  return text.normalize("NFKC").replace(/\s+/gu, " ").trim();
}
function canonicalNumber(value: string): number {
  return Number(value.replace(",", "."));
}
function numericTokens(text: string, suffix: "%" | "EUR"): number[] {
  if (suffix === "%") {
    return [...text.matchAll(/\b(\d+(?:[.,]\d{1,3})?)\s*%/gu)].map(m => canonicalNumber(m[1]));
  }
  const tokens: number[] = [];
  for (const m of text.matchAll(/€\s*(\d+(?:[.,]\d{1,2})?)|\b(\d+(?:[.,]\d{1,2})?)\s*€/gu)) {
    tokens.push(canonicalNumber(m[1] || m[2]));
  }
  return tokens;
}

export function verifyFeniceExplanation(
  explanation: string,
  grounded: ExplanationEvidence,
): ExplanationSafetyVerdict {
  const output = simplify(explanation);
  const plain = output.toLocaleLowerCase("it-IT");

  // Reject broker-operation claims and instructions. The model has no broker
  // connectivity and cannot initiate execution. Negated status messages such
  // as "non vi sono ordini autorizzati" are intentionally allowed.
  const claimedExecution =
    /\b(?:ho|abbiamo|fenice\s+ha|il\s+sistema\s+ha)\s+(?:acquistato|venduto|eseguito|inviato|piazzato)\b/iu.test(plain)
    || /\b(?:ordine|ordini|trade|operazione|operazioni)\s+(?:\w+\s+){0,2}(?:eseguit[oi]|inviat[oi]|piazzat[oi]|comprat[oi]|vendut[oi])\b/iu.test(plain);
  if (claimedExecution) return { accepted: false, reason: "CLAIMED_EXECUTION" };

  const imperative =
    /(?<![\p{L}\p{N}])(?:ti\s+(?:consiglio|suggerisco)|conviene|dovresti|devi|raccomando|sarebbe\s+opportuno|è\s+il\s+momento\s+di)\s+(?:di\s+)?(?:comprare|acquistare|vendere|investire|entrare|aprire\s+una\s+posizione)\b/iu.test(plain)
    || /\b(?:compra|acquista|vendi|investi)\s+(?:subito|adesso|oggi|ora|[A-Z]{2,8})\b/iu.test(output)
    || /\b(?:buy|sell)\s+(?:now|today|[A-Z]{2,8})\b/iu.test(output);
  if (imperative) return { accepted: false, reason: "UNAUTHORIZED_TRADE" };

  const evidenceCorpus = simplify([
    ...grounded.paragraphs, ...grounded.blockers,
    ...grounded.evidence.flatMap(item => [item.value]),
  ].join(" "));

  // Prevent unsupported percentage and euro amounts: source-backed values
  // must already exist in the deterministic explanation or evidence.
  for (const unit of ["%", "EUR"] as const) {
    const allowed = numericTokens(evidenceCorpus, unit);
    for (const value of numericTokens(output, unit)) {
      if (!Number.isFinite(value) || !allowed.some(n => Math.abs(n - value) < 0.0001)) {
        return { accepted: false, reason: "UNSUPPORTED_NUMERIC_CLAIM" };
      }
    }
  }

  const allowedFiles = new Set(grounded.evidence.map(e => e.source).filter(x => /^data\/[a-z0-9-]+\.json$/iu.test(x)));
  for (const match of output.matchAll(/\bdata\/[a-z0-9-]+\.json\b/giu)) {
    if (!allowedFiles.has(match[0])) return { accepted: false, reason: "UNSUPPORTED_SOURCE" };
  }

  return { accepted: true, reason: "SUPPORTED_CLAIMS" };
}
