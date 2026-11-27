/** Owner-authenticated independent prospective PAPER genesis. No fills, market calls or LIVE. */
import {isOwnerAuthorized} from '@/lib/ai/fenice-generative-research';
import {feniceSessionCookieFromRequest,verifyFeniceOwnerSession} from '@/lib/ai/fenice-owner-session';
import {createProspectiveR2PaperStore} from '../../../../lib/trading/one-global-r2-prospective-paper-store.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const maxDuration=60;
import {createGenesisHandlers} from '../../../../lib/trading/one-global-r2-genesis-handler.mjs';
const handlers=createGenesisHandlers({env:process.env,isOwnerAuthorized,feniceSessionCookieFromRequest,verifyFeniceOwnerSession,createProspectiveR2PaperStore});
export async function GET(request){return handlers.GET(request);}
export async function POST(request){return handlers.POST(request);}
