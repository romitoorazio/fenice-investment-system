import { extractYahooEurUsdResearchSnapshot } from "@/lib/ui/fx-research-snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchEurUsd() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/EURUSD%3DX?interval=1d&range=5d",
      {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "Mozilla/5.0 FeniceInvestmentSystem/4.1",
        },
        next: { revalidate: 300 },
      },
    );
    if (!response.ok) throw new Error("FX_PROVIDER_UNAVAILABLE");
    return extractYahooEurUsdResearchSnapshot(await response.json(), Date.now());
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  try {
    const rate = await fetchEurUsd();
    return Response.json(rate, {
      headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    // An error's timestamp denotes REPORT creation, never a fictional FX trade.
    // Never expose the upstream provider body or a credential-bearing exception.
    return Response.json({
      eurUsd: null,
      observedAt: null,
      generatedAt: new Date().toISOString(),
      source: "Yahoo Finance EURUSD=X",
      status: "errore",
      detail: error instanceof Error && /^FX_[A-Z_]+$/.test(error.message)
        ? error.message : "Cambio non disponibile",
      quoteKind: "HISTORICAL_DAILY_CLOSE",
      researchOnly: true,
      paperFxEligible: false,
      liveTradingAllowed: false,
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
