import masterData from "@/data/instrument-master.json";
import {
  type AssetClass,
  type InstrumentMaster,
  summarizeInstrumentMaster,
} from "@/lib/market/instrument-master";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const master = masterData as InstrumentMaster;
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const region = searchParams.get("region")?.trim().toLowerCase();
  const country = searchParams.get("country")?.trim().toUpperCase();
  const assetClass = searchParams.get("assetClass")?.trim().toLowerCase() as
    | AssetClass
    | undefined;
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 100), 1), 1000);

  const instruments = master.instruments
    .filter((instrument) => !region || instrument.region.toLowerCase() === region)
    .filter((instrument) => !country || instrument.country.toUpperCase() === country)
    .filter((instrument) => !assetClass || instrument.assetClass === assetClass)
    .filter((instrument) => {
      if (!query) return true;
      const haystack = [
        instrument.id,
        instrument.name,
        instrument.ticker,
        instrument.exchangeMic,
        instrument.exchangeName,
        instrument.sector,
        instrument.industry,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .slice(0, limit);

  return Response.json(
    {
      generatedAt: master.generatedAt,
      coverage: master.coverage,
      summary: summarizeInstrumentMaster(master),
      returned: instruments.length,
      filters: { query, region, country, assetClass, limit },
      instruments,
      warning:
        master.coverage === "global"
          ? null
          : "Instrument master coverage is not yet complete; results are a verified seed universe.",
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
