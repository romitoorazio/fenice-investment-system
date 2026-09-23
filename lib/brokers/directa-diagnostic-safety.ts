export type SanitizedDirectaError = {
  ticker: string;
  code: number | null;
  socket?: string;
};

export function sanitizeDirectaDiagnosticError(
  rawIdentifier: unknown,
  rawCode: unknown,
  requestedTickers: readonly string[],
): SanitizedDirectaError {
  const requested = new Set(
    requestedTickers.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean),
  );
  const normalized = String(rawIdentifier || "").trim().toUpperCase();
  const safeTicker = normalized && requested.has(normalized) ? normalized : normalized ? "<redacted>" : "";
  const numericCode = Number(rawCode);

  return {
    ticker: safeTicker,
    code: Number.isFinite(numericCode) ? numericCode : null,
  };
}

export function sanitizeSocketErrorCode(rawCode: unknown): string {
  const normalized = String(rawCode || "SOCKET_ERROR").trim().toUpperCase();
  return /^[A-Z0-9_]{1,40}$/.test(normalized) ? normalized : "SOCKET_ERROR";
}
