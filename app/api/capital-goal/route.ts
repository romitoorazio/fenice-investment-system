import { DEFAULT_CAPITAL_GOAL, buildCapitalGoalPlan } from "@/lib/capital-goal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function numberParam(url: URL, key: string, fallback: number) {
  const raw = url.searchParams.get(key);
  if (raw === null) return fallback;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const plan = buildCapitalGoalPlan({
    initialCapital: numberParam(url, "initial", DEFAULT_CAPITAL_GOAL.input.initialCapital),
    targetCapital: numberParam(url, "target", DEFAULT_CAPITAL_GOAL.input.targetCapital),
    horizonYears: numberParam(url, "years", DEFAULT_CAPITAL_GOAL.input.horizonYears),
    annualContribution: numberParam(url, "annualContribution", DEFAULT_CAPITAL_GOAL.input.annualContribution),
  });

  return Response.json(plan, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
