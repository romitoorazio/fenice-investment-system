import {getWorldTacticalEvidence} from '@/lib/ui/one-global-world-radar-evidence';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function GET(){
  return Response.json(await getWorldTacticalEvidence(),{headers:{'Cache-Control':'no-store,max-age=0'}});
}
