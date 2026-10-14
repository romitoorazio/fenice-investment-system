import { buildMultiBrokerReadiness } from "@/lib/brokers/multi-broker-readiness";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Public configuration readiness only: never expose accounts or credentials. */
export async function GET() {
  return Response.json(buildMultiBrokerReadiness(), {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
