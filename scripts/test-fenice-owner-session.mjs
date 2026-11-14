import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FENICE_AI_SESSION_SECONDS,
  FENICE_AI_SESSION_DAYS,
  FENICE_AI_SESSION_COOKIE,
  createFeniceOwnerSession,
  verifyFeniceOwnerSession,
  feniceSessionCookieFromRequest,
  feniceSessionSetCookie,
  feniceSessionClearCookie,
  feniceSameOrigin,
  handleFeniceOwnerSessionRequest,
} from "../lib/ai/fenice-owner-session.ts";
import {isOwnerAuthorized,generativeAvailability} from "../lib/ai/fenice-generative-research.ts";

const owner = "fenice-unit-test-owner-secret-with-fifty-characters-only";
const other = "changed-fenice-owner-secret-that-revokes-old-sessions";
const now = Date.parse("2026-10-11T18:00:00.000Z");
const day = 86400000;
assert.equal(FENICE_AI_SESSION_DAYS, 400);
assert.equal(FENICE_AI_SESSION_SECONDS, 400 * 86400);
assert.equal(FENICE_AI_SESSION_COOKIE, "__Host-fenice_ai_session");

const token = createFeniceOwnerSession(owner, now);
assert.match(token, /^\d{9,12}\.[A-Za-z0-9_-]{43}$/);
assert.equal(verifyFeniceOwnerSession(token, owner, now), true);
assert.equal(verifyFeniceOwnerSession(token, owner, now + 7 * day), true);
assert.equal(verifyFeniceOwnerSession(token, owner, now + 399 * day), true);
assert.equal(verifyFeniceOwnerSession(token, owner, now + 400 * day), false);
assert.equal(verifyFeniceOwnerSession(token, owner, now - 1000), false);
assert.equal(verifyFeniceOwnerSession(token, other, now), false, "owner rotation must revoke sessions");
assert.equal(verifyFeniceOwnerSession(token + "a", owner, now), false);
assert.equal(verifyFeniceOwnerSession(token.replace(/.$/, "x"), owner, now), false);
assert.equal(createFeniceOwnerSession("short", now), null);
assert.equal(verifyFeniceOwnerSession(null, owner, now), false);
assert.ok(!token.includes(owner));

const refreshedAt = now + 399 * day;
const renewed = createFeniceOwnerSession(owner, refreshedAt);
assert.notEqual(token, renewed);
assert.equal(verifyFeniceOwnerSession(renewed, owner, refreshedAt + 399 * day), true,
  "opening Fenice again must extend the trusted browser for another 400 days");

const setCookie = feniceSessionSetCookie(token);
assert.match(setCookie, /Max-Age=34560000/);
assert.match(setCookie, /HttpOnly/);
assert.match(setCookie, /Secure/);
assert.match(setCookie, /SameSite=Strict/);
assert.match(setCookie, /Path=\//);
assert.ok(!setCookie.includes(owner));
assert.match(feniceSessionClearCookie(), /Max-Age=0/);

const sameOrigin = new Request("https://fenice-investment-system.vercel.app/api/analista-generativa/session", {
  headers: {
    Cookie: `other=1; ${FENICE_AI_SESSION_COOKIE}=${token}; more=1`,
    Origin: "https://fenice-investment-system.vercel.app",
  },
});
assert.equal(feniceSessionCookieFromRequest(sameOrigin), token);
assert.equal(feniceSameOrigin(sameOrigin), true);
assert.equal(feniceSameOrigin(new Request(sameOrigin.url, {
  headers: { Origin: "https://another-site.example" },
})), false);
assert.equal(feniceSameOrigin(new Request(sameOrigin.url)), false,
  "origin check should not permit cross-origin or originless cookie POSTs");

const route = readFileSync(new URL("../app/api/analista-generativa/session/route.ts", import.meta.url), "utf-8");
assert.match(route,/handleFeniceOwnerSessionRequest/);
assert.doesNotMatch(route,/generativeAvailability|OPENAI_API_KEY|AI_NOT_CONFIGURED/);
const endpoint="https://fenice-investment-system.vercel.app/api/analista-generativa/session";
const options={secret:owner,verifyCredential:isOwnerAuthorized,now};
assert.notEqual(generativeAvailability({FENICE_AI_OWNER_TOKEN:owner}),"READY");
const login=await handleFeniceOwnerSessionRequest(new Request(endpoint,{method:"POST",
  headers:{Origin:new URL(endpoint).origin,Authorization:"Bearer "+owner}}),options);
assert.equal(login.status,200,"owner login must work while generative services are disabled");
assert.equal((await login.json()).authenticated,true);assert.ok(login.headers.get("set-cookie"));
const cookie=login.headers.get("set-cookie").split(";")[0];
const access=await handleFeniceOwnerSessionRequest(new Request(endpoint,{headers:{Cookie:cookie}}),options);
assert.equal((await access.json()).authenticated,true);assert.ok(access.headers.get("set-cookie"));
const anonymous=await handleFeniceOwnerSessionRequest(new Request(endpoint),options);
assert.equal((await anonymous.json()).authenticated,false);assert.equal(anonymous.headers.get("set-cookie"),null);
const wrong=await handleFeniceOwnerSessionRequest(new Request(endpoint,{method:"POST",headers:{Origin:new URL(endpoint).origin,Authorization:"Bearer "+other}}),options);
assert.equal(wrong.status,401);
const csrf=await handleFeniceOwnerSessionRequest(new Request(endpoint,{method:"POST",headers:{Origin:"https://evil.example",Authorization:"Bearer "+owner}}),options);
assert.equal(csrf.status,403);
const unavailable=await handleFeniceOwnerSessionRequest(new Request(endpoint,{method:"POST",headers:{Origin:new URL(endpoint).origin}}),{...options,secret:undefined});
assert.equal(unavailable.status,503);
assert.doesNotMatch(await wrong.text(),/fenice-unit-test-owner/);
const generation = readFileSync(new URL("../app/api/analista-generativa/route.ts", import.meta.url), "utf-8");
assert.match(generation, /verifyFeniceOwnerSession/);
assert.match(generation, /feniceSameOrigin\(request\)/);
assert.match(generation, /OWNER_AUTH_REQUIRED/);
assert.match(generation, /FENICE_AI_MANUAL_ONLY/);
console.log("Fenice persistent owner browser session: PASS");
