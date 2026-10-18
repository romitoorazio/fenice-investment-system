import committee from "@/data/investment-committee.json";
import master from "@/data/instrument-master.json";
import terminal from "@/data/terminal-intelligence.json";
import reference from "@/data/global-reference-coverage.json";
import universe from "@/data/global-market-universe.json";
import {evaluateGlobalOpportunityAudit} from "@/lib/ui/global-opportunity-audit";
import fundamentals from "@/data/fundamental-research.json";
import {buildInternationalResearchQueue} from "@/lib/ui/international-research-queue";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
// Static persisted evidence only, validated afresh per request. No paid provider
// calls or order/quote endpoints; never label a catalog price executable.
export async function GET(){
  const result=evaluateGlobalOpportunityAudit(committee,master,terminal,reference,universe,Date.now());
  const international=buildInternationalResearchQueue(master,fundamentals,terminal,committee,reference,Date.now());
  return Response.json({...result,international},{headers:{"Cache-Control":"no-store,max-age=0"}});
}
