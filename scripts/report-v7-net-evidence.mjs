import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function ageHours(value, now) {
  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp) || timestamp > now) return null;
  return Number(((now - timestamp) / 3_600_000).toFixed(2));
}

// Research-only scorecard: gross shadow marks are NOT realized or net P&L.
export function buildV7NetEvidence({ shadow, promotion, campaign }, now = Date.now()) {
  if (!shadow || !promotion || !campaign || !Number.isFinite(now)) throw new Error("Missing evidence");
  if (shadow.safety?.diagnosticOnly !== true || shadow.safety?.liveTradingAllowed !== false ||
      promotion.safety?.diagnosticOnly !== true || promotion.safety?.liveTradingAllowed !== false ||
      campaign.liveTradingAllowed !== false) throw new Error("Evidence safety flags inconsistent");
  const sourceAgeHours = ageHours(shadow.generatedAt, now);
  const maxAgeHours = Number.isFinite(shadow.methodology?.sourceFreshnessHours)
    ? shadow.methodology.sourceFreshnessHours : 0;
  const horizon = (key, label) => {
    const row = shadow[key];
    if (!row || !Number.isInteger(row.sampleSize) || row.sampleSize < 0) throw new Error("Missing mature sample evidence");
    return {
      horizon: label,
      maturedResearchSamples: row.sampleSize,
      reportedGrossResearchReturnPercent: Number.isFinite(row.averageStagedReturnPercent)
        ? row.averageStagedReturnPercent : null,
      verifiedNetReturnPercent: null,
      verifiedNetReturnStatus: "UNAVAILABLE_WITHOUT_FEES_SPREAD_SLIPPAGE_AND_FX",
      performanceClaimAllowed: false,
      maturity: row.maturity ?? "UNKNOWN",
    };
  };
  const days = Array.isArray(campaign.dailyEvidence) ? campaign.dailyEvidence : [];
  const latest = days.at(-1) ?? null;
  return {
    schemaVersion: 1,
    asOf: new Date(now).toISOString(),
    diagnosticOnly: true,
    brokerOrderSubmissionAllowed: false,
    liveTradingAllowed: false,
    source: { generatedAt: shadow.generatedAt ?? null, ageHours: sourceAgeHours,
      maxAgeHours, fresh: sourceAgeHours !== null && sourceAgeHours <= maxAgeHours },
    shadowPromotion: { state: promotion.state ?? "UNKNOWN",
      eligibleForHumanResearchReview: promotion.eligibleForHumanResearchReview === true,
      automaticPromotionAllowed: false,
      blockers: Array.isArray(promotion.blockers) ? promotion.blockers : ["UNKNOWN_BLOCKERS"] },
    horizons: [horizon("matured7d", "7d"), horizon("matured30d", "30d")],
    latestResearchMarks: (Array.isArray(shadow.latestRecords) ? shadow.latestRecords : [])
      .slice(0, 25).map(row => ({
        symbol: String(row.symbol ?? ""),
        grossMarkToMarketPercent: Number.isFinite(row.stagedMarkToMarketPercent)
          ? row.stagedMarkToMarketPercent : null,
        verifiedNetReturnPercent: null,
        executedBrokerOrder: false,
      })),
    paperCertification: {
      evidenceDays: days.length, requiredEvidenceDays: campaign.minEvidenceDays ?? null,
      minimumCalendarDays: campaign.requiredDays ?? null,
      cumulativeSimulatedFills: latest?.cumulativePaperFilled ?? 0,
      minimumSimulatedFills: campaign.minPaperFills ?? null,
      latestReconciliationBalanced: latest?.reconciliationBalanced === true,
      latestAuditChainValid: latest?.auditChainValid === true,
    },
    conclusion: "NO_VERIFIED_NET_EDGE",
    limitations: [
      "Shadow marks are not funded trades or verified net portfolio P&L.",
      "Fees, spread, slippage, FX conversion and funding are not reconciled.",
      "Forward-only mature samples and a suitable benchmark are required.",
      "This report never authorizes PAPER or LIVE orders.",
    ],
  };
}

export async function run(root = process.cwd(), now = Date.now()) {
  const data = async name => JSON.parse(await readFile(resolve(root, "data", name), "utf8"));
  return buildV7NetEvidence({
    shadow: await data("v7-horizon-shadow-evaluation.json"),
    promotion: await data("v7-shadow-promotion-gate.json"),
    campaign: await data("paper-validation-campaign.json"),
  }, now);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error("Fenice V7 evidence: " + error.message); process.exitCode = 1; });
}
