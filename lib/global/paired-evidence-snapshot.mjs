/** Fail-closed gate for separately persisted FX and quote evidence snapshots. */
import {createHash} from "node:crypto";
export const snapshotDigest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function verifyPairedEvidenceSnapshot({fx,quotes,manifest,nowIso}) {
  const fail = reason => ({accepted:false,reason});
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now) || !fx || !quotes || !manifest || typeof manifest !== "object") return fail("SNAPSHOT_INCOMPLETE");
  if (manifest.version !== 1 || typeof manifest.runId !== "string" || !manifest.runId.trim()) return fail("SNAPSHOT_MANIFEST_INVALID");
  if (manifest.fxSha256 !== snapshotDigest(fx) || manifest.quotesSha256 !== snapshotDigest(quotes)) return fail("SNAPSHOT_DIGEST_MISMATCH");
  const fxTime = Date.parse(fx.generatedAt), quoteTime = Date.parse(quotes.generatedAt), published = Date.parse(manifest.publishedAt);
  if (![fxTime,quoteTime,published].every(Number.isFinite)) return fail("SNAPSHOT_CLOCK_INVALID");
  if ([fxTime,quoteTime,published].some(t => t > now)) return fail("SNAPSHOT_FUTURE_TIMESTAMP");
  if (published < Math.max(fxTime,quoteTime)) return fail("SNAPSHOT_PREMATURE_PUBLICATION");
  if (now - published > 120000 || now - fxTime > 120000 || now - quoteTime > 120000) return fail("SNAPSHOT_STALE");
  if (fx.liveTradingAllowed !== false || quotes.policy?.liveTradingAllowed !== false) return fail("SNAPSHOT_LIVE_FORBIDDEN");
  return {accepted:true,reason:null,runId:manifest.runId};
}
