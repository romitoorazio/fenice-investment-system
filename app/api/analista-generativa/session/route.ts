import {isOwnerAuthorized} from "@/lib/ai/fenice-generative-research";
import {handleFeniceOwnerSessionRequest} from "@/lib/ai/fenice-owner-session";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
function handle(request:Request){
  return handleFeniceOwnerSessionRequest(request,{
    secret:process.env.FENICE_AI_OWNER_TOKEN,verifyCredential:isOwnerAuthorized,
  });
}
export const GET=handle;
export const POST=handle;
export const DELETE=handle;
