import universeData from "@/data/global-market-universe.json";
import sourceRegistryData from "@/data/global-source-registry.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Region = {
  id: string;
  name: string;
  countries: string[];
  exchanges: string[];
  priority: number;
};

type AssetClass = {
  id: string;
  name: string;
  target: string;
  status: "foundation" | "planned" | "active";
};

export async function GET() {
  const universe = universeData as {
    version: number;
    updatedAt: string;
    policy: Record<string, unknown>;
    regions: Region[];
    assetClasses: AssetClass[];
    coverageDimensions: string[];
  };
  const sourceRegistry = sourceRegistryData as {
    sources: Array<{ category?: string; regions?: string[] }>;
  };

  const exchanges = universe.regions.reduce((total, region) => total + region.exchanges.length, 0);
  const countries = new Set(universe.regions.flatMap((region) => region.countries)).size;
  const activeAssetClasses = universe.assetClasses.filter((asset) => asset.status === "active").length;
  const foundationAssetClasses = universe.assetClasses.filter((asset) => asset.status === "foundation").length;

  return Response.json(
    {
      updatedAt: universe.updatedAt,
      summary: {
        regions: universe.regions.length,
        countries,
        exchanges,
        assetClasses: universe.assetClasses.length,
        activeAssetClasses,
        foundationAssetClasses,
        registeredSources: sourceRegistry.sources.length,
        coverageDimensions: universe.coverageDimensions.length,
      },
      regions: universe.regions,
      assetClasses: universe.assetClasses,
      coverageDimensions: universe.coverageDimensions,
      policy: universe.policy,
      disclaimer: "This endpoint describes Fenice's target universe and current construction state. It does not claim complete realtime coverage until licensed exchange feeds and instrument masters are active.",
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
