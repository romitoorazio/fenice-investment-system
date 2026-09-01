const DEFAULT_SENSITIVE_PARAMS = new Set([
  "api_key",
  "apikey",
  "key",
  "token",
  "access_token",
  "client_secret",
  "secret",
  "password",
]);

/**
 * Return a URL safe to persist in logs, reports and git history.
 * Query-string credentials are replaced even when the caller does not know
 * which provider-specific parameter name was used.
 */
export function sanitizeEndpoint(value, { secrets = [], sensitiveParams = DEFAULT_SENSITIVE_PARAMS } = {}) {
  if (!value) return value ?? null;

  let sanitized = String(value);

  try {
    const url = new URL(sanitized);
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveParams.has(key.toLowerCase())) {
        url.searchParams.set(key, "REDACTED");
      }
    }
    sanitized = url.toString();
  } catch {
    sanitized = sanitized.replace(
      /([?&](?:api[_-]?key|apikey|key|token|access_token|client_secret|secret|password)=)[^&#\s]*/gi,
      "$1REDACTED",
    );
  }

  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length < 4) continue;
    sanitized = sanitized.split(secret).join("REDACTED");
  }

  return sanitized;
}

export function containsCredentialLikeQueryValue(value) {
  if (!value) return false;
  const text = String(value);
  try {
    const url = new URL(text);
    for (const [key, val] of url.searchParams.entries()) {
      if (!DEFAULT_SENSITIVE_PARAMS.has(key.toLowerCase())) continue;
      if (val && val !== "REDACTED" && val !== "{key}") return true;
    }
    return false;
  } catch {
    return /[?&](?:api[_-]?key|apikey|key|token|access_token|client_secret|secret|password)=(?!REDACTED(?:&|$)|\{key\}(?:&|$))[^&#\s]+/i.test(text);
  }
}
