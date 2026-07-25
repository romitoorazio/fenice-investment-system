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
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const rate = [...closes].reverse().find((value) => Number.isFinite(value) && Number(value) > 0);
    if (!Number.isFinite(rate)) throw new Error("Cambio non disponibile");
    const timestamp = result?.timestamp?.at(-1);
    return {
      eurUsd: Number(rate),
      observedAt: timestamp ? new Date(Number(timestamp) * 1000).toISOString() : new Date().toISOString(),
      source: "Yahoo Finance EURUSD=X",
      status: "operativo",
    };
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
    return Response.json(
      {
        eurUsd: null,
        observedAt: new Date().toISOString(),
        source: "Yahoo Finance EURUSD=X",
        status: "errore",
        detail: error instanceof Error ? error.message : "Cambio non disponibile",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
