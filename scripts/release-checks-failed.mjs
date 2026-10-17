// Release guard helper: detect a *completed and failed* required GitHub
// Actions check only. Anything missing/pending is handled by the bounded
// exact-SHA polling loop; no positive authorization is returned by this tool.
import { readFileSync } from "node:fs";
import { REQUIRED_FENICE_CHECKS } from "../lib/ui/github-production-checks.mjs";

const sha = String(process.env.GITHUB_SHA || "");
let failed = false;
try {
  const text = readFileSync(0, "utf8");
  if (text.length > 512_000) throw new Error("oversized");
  const data = JSON.parse(text);
  if (!/^[a-f0-9]{40}$/.test(sha) || !Array.isArray(data?.check_runs) ||
      !Number.isSafeInteger(data.total_count) || data.total_count > 100 ||
      data.total_count < data.check_runs.length || data.check_runs.length > 100) {
    process.exitCode = 1;
  } else {
    const latest = new Map();
    for (const item of data.check_runs) {
      if (item?.head_sha !== sha || item?.app?.slug !== "github-actions"
        || !REQUIRED_FENICE_CHECKS.includes(item?.name)
        || !Number.isSafeInteger(item?.id)) continue;
      const at = Date.parse(item.completed_at || item.started_at || "");
      if (!Number.isFinite(at) || at > Date.now() + 30_000) continue;
      const previous = latest.get(item.name);
      if (!previous || at > previous.at || (at === previous.at && item.id > previous.id)) {
        latest.set(item.name, { at, id: item.id, row: item });
      }
    }
    failed = [...latest.values()].some(({row}) => row.status === "completed"
      && !["success", "neutral", "skipped"].includes(row.conclusion));
    // Neutral/skipped do not count as green; the release remains blocked
    // by the separate positive-authority verifier.
    process.exitCode = failed ? 0 : 1;
  }
} catch {
  process.exitCode = 1;
}
