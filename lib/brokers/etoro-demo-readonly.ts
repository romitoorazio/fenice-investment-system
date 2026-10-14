/**
 * Opt-in eToro DEMO-only read-only adapter.
 *
 * No credentials are read from env and no network call happens unless a
 * server-side caller supplies both credentials and an explicit transport.
 * Never call from a public route. Never use this data to execute on Directa.
 */
export const ETORO_DEMO_PORTFOLIO_URL =
  "https://public-api.etoro.com/api/v1/trading/info/demo/portfolio";

export type EtoroDemoReadResult = {
  broker: "etoro";
  environment: "DEMO";
  access: "READ_ONLY";
  observedAt: string;
  researchOnly: true;
  brokerOrderSubmissionAllowed: false;
  usableAsDirectaExecutionQuote: false;
  portfolio: unknown;
};

export type EtoroDemoResponse = Pick<Response, "ok" | "status" | "json">;
export type EtoroDemoTransport = (url: string, init: RequestInit) => Promise<EtoroDemoResponse>;

export async function readEtoroDemoPortfolio(input: {
  publicApiKey: string;
  userKey: string;
  requestId: string;
  transport: EtoroDemoTransport;
}): Promise<EtoroDemoReadResult> {
  if (!input.publicApiKey?.trim() || !input.userKey?.trim()) {
    throw new Error("ETORO_DEMO_CREDENTIALS_REQUIRED");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId ?? "")) {
    throw new Error("ETORO_DEMO_REQUEST_ID_REQUIRED");
  }
  if (typeof input.transport !== "function") {
    throw new Error("ETORO_DEMO_EXPLICIT_TRANSPORT_REQUIRED");
  }

  let response: EtoroDemoResponse;
  try {
    response = await input.transport(ETORO_DEMO_PORTFOLIO_URL, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": input.publicApiKey,
        "x-user-key": input.userKey,
        "x-request-id": input.requestId,
      },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Never propagate transport error bodies/URLs that may contain secrets.
    throw new Error("ETORO_DEMO_TRANSPORT_ERROR");
  }
  if (!response.ok) {
    throw new Error(`ETORO_DEMO_HTTP_${Number(response.status) || "ERROR"}`);
  }
  let portfolio: unknown;
  try {
    portfolio = await response.json();
  } catch {
    throw new Error("ETORO_DEMO_INVALID_JSON");
  }
  if (portfolio === null || typeof portfolio !== "object") {
    throw new Error("ETORO_DEMO_INVALID_PORTFOLIO");
  }
  return {
    broker: "etoro",
    environment: "DEMO",
    access: "READ_ONLY",
    observedAt: new Date().toISOString(),
    researchOnly: true,
    brokerOrderSubmissionAllowed: false,
    usableAsDirectaExecutionQuote: false,
    portfolio,
  };
}
