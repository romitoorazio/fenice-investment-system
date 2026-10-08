import { evaluateFxExposure } from "../trading/fx-exposure.ts";
import { verifyAuditChain, type AuditEvent } from "../trading/audit-chain.ts";

type PaperMarketSession = {
  configured?: boolean;
  evidence?: {
    state?: string;
    source?: string;
    observedAt?: string;
    authoritative?: boolean;
  };
  decision?: {
    allowed?: boolean;
    state?: string;
    reasons?: unknown[];
  };
};

type PaperMarketFxEvidence = {
  readyNow?: boolean;
  requiredForNonEuro?: boolean;
  provider?: string;
  expectedProvider?: string;
  baseCurrency?: string;
  expectedBaseCurrency?: string;
  usdPair?: string;
  usdRate?: number;
  usdObservedAt?: string;
  provenanceVerified?: boolean;
  liveTradingAllowed?: boolean;
  brokerConnectivityAllowed?: boolean;
};

type PaperFillFxProof = {
  ready?: boolean;
  requiredForAdditionalFills?: boolean;
  nonEuroFills?: number;
  matchedNonEuroFills?: number;
  proofs?: Array<{
    clientOrderId?: string;
    readyAtFill?: boolean;
    matches?: boolean;
  }>;
};

type PaperEvidenceRow = {
  date?: string;
  observedAt?: string;
  liveTradingAllowed?: boolean;
  brokerConnectivityAllowed?: boolean;
  auditChainValid?: boolean;
  marketSession?: PaperMarketSession;
  marketFxEvidence?: PaperMarketFxEvidence;
  fillEvidenceProof?: {
    complete?: boolean;
    windows?: Array<{
      marketFx?: PaperFillFxProof;
    }>;
  };
};

type PaperCampaignLike = {
  dailyEvidence?: PaperEvidenceRow[];
};

type PaperOmsLike = {
  liveTradingAllowed?: boolean;
  brokerConnectivityAllowed?: boolean;
  auditChain?: AuditEvent[];
  positions?: Array<{
    quantity?: number;
    averagePrice?: number;
    currency?: string;
    fxToEuro?: number;
  }>;
  executions?: Array<{
    clientOrderId?: string;
    status?: string;
    currency?: string;
    fxToEuro?: number;
    fxProvider?: string | null;
    fxObservedAt?: string | null;
    risk?: {
      checks?: Array<{
        code?: string;
        passed?: boolean;
        observed?: unknown;
      }>;
    };
  }>;
};

function evidenceTime(row: PaperEvidenceRow) {
  const parsedObserved = Date.parse(String(row?.observedAt || ""));
  if (Number.isFinite(parsedObserved)) return parsedObserved;
  const parsedDate = Date.parse(`${String(row?.date || "")}T00:00:00.000Z`);
  return Number.isFinite(parsedDate) ? parsedDate : 0;
}

function safePaperLocks(row: PaperEvidenceRow) {
  return row?.liveTradingAllowed === false && row?.brokerConnectivityAllowed === false;
}

function validSessionEvidence(row: PaperEvidenceRow) {
  const session = row?.marketSession;
  const state = String(session?.evidence?.state || "").trim().toUpperCase();
  const source = String(session?.evidence?.source || "").trim();
  const observedAt = Date.parse(String(session?.evidence?.observedAt || ""));
  const decisionAllowed = session?.decision?.allowed;
  const decisionState = String(session?.decision?.state || state).trim().toUpperCase();
  const stateDecisionConsistent = state === "OPEN"
    ? decisionAllowed === true
    : ["CLOSED", "HALTED"].includes(state)
      ? decisionAllowed === false
      : false;

  return safePaperLocks(row)
    && session?.configured === true
    && session?.evidence?.authoritative === true
    && ["OPEN", "CLOSED", "HALTED"].includes(state)
    && source.length > 0
    && Number.isFinite(observedAt)
    && decisionState === state
    && stateDecisionConsistent;
}

function collectCertifiedForeignFillIds(rows: PaperEvidenceRow[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!safePaperLocks(row) || row?.fillEvidenceProof?.complete !== true) continue;
    const windows = Array.isArray(row?.fillEvidenceProof?.windows) ? row.fillEvidenceProof.windows : [];
    for (const window of windows) {
      const proof = window?.marketFx;
      const nonEuroFills = Number(proof?.nonEuroFills || 0);
      const matched = Number(proof?.matchedNonEuroFills || 0);
      const proofs = Array.isArray(proof?.proofs) ? proof.proofs : [];
      const structurallyValid = proof?.ready === true
        && proof?.requiredForAdditionalFills === true
        && nonEuroFills > 0
        && matched === nonEuroFills
        && proofs.length === nonEuroFills
        && proofs.every((item) => item?.readyAtFill === true
          && item?.matches === true
          && String(item?.clientOrderId || "").trim().length > 0);
      if (!structurallyValid) continue;
      for (const item of proofs) ids.add(String(item.clientOrderId));
    }
  }
  return ids;
}

function validLatestFxEvidence(rows: PaperEvidenceRow[]) {
  return [...rows].reverse().find((row) => {
    const fx = row?.marketFxEvidence;
    const rate = Number(fx?.usdRate);
    const observedAt = Date.parse(String(fx?.usdObservedAt || ""));
    const provider = String(fx?.provider || "").trim().toLowerCase();
    const expectedProvider = String(fx?.expectedProvider || provider).trim().toLowerCase();
    return safePaperLocks(row)
      && fx?.readyNow === true
      && fx?.requiredForNonEuro === true
      && fx?.provenanceVerified === true
      && fx?.liveTradingAllowed === false
      && fx?.brokerConnectivityAllowed === false
      && String(fx?.baseCurrency || "").toUpperCase() === "EUR"
      && String(fx?.expectedBaseCurrency || "EUR").toUpperCase() === "EUR"
      && String(fx?.usdPair || "").toUpperCase() === "USD/EUR"
      && provider.length > 0
      && provider === expectedProvider
      && Number.isFinite(rate)
      && rate > 0
      && Number.isFinite(observedAt);
  });
}

function inferPaperCapitalEuro(oms: PaperOmsLike | null | undefined) {
  const executions = Array.isArray(oms?.executions) ? [...oms.executions].reverse() : [];
  for (const execution of executions) {
    const checks = Array.isArray(execution?.risk?.checks) ? execution.risk.checks : [];
    const capitalCheck = checks.find((check) => check?.code === "valid-capital" && check?.passed === true);
    const capital = Number(capitalCheck?.observed);
    if (Number.isFinite(capital) && capital > 0) return capital;
  }
  return null;
}

export function derivePaperRuntimeEvidence(
  campaign: PaperCampaignLike | null | undefined,
  oms?: PaperOmsLike | null,
) {
  const rows = Array.isArray(campaign?.dailyEvidence)
    ? [...campaign.dailyEvidence].sort((a, b) => evidenceTime(a) - evidenceTime(b))
    : [];
  const newestFirst = [...rows].reverse();
  const openSessionRow = newestFirst.find((row) => validSessionEvidence(row)
    && String(row?.marketSession?.evidence?.state || "").toUpperCase() === "OPEN");
  const blockedSessionRow = newestFirst.find((row) => validSessionEvidence(row)
    && ["CLOSED", "HALTED"].includes(String(row?.marketSession?.evidence?.state || "").toUpperCase()));
  const latestSessionRow = [openSessionRow, blockedSessionRow]
    .filter(Boolean)
    .sort((a, b) => evidenceTime(a as PaperEvidenceRow) - evidenceTime(b as PaperEvidenceRow))
    .at(-1) as PaperEvidenceRow | undefined;

  const latestFxRow = validLatestFxEvidence(rows);
  const certifiedForeignFillIds = collectCertifiedForeignFillIds(rows);
  const executions = Array.isArray(oms?.executions) ? oms.executions : [];
  const foreignFills = executions.filter((execution) =>
    execution?.status === "PAPER_FILLED" && String(execution?.currency || "EUR").toUpperCase() !== "EUR");
  const foreignFillsCertified = foreignFills.length > 0 && foreignFills.every((execution) => {
    const id = String(execution?.clientOrderId || "");
    const rate = Number(execution?.fxToEuro);
    const observedAt = Date.parse(String(execution?.fxObservedAt || ""));
    return certifiedForeignFillIds.has(id)
      && Number.isFinite(rate)
      && rate > 0
      && String(execution?.fxProvider || "").trim().length > 0
      && Number.isFinite(observedAt);
  });

  const capitalEuro = inferPaperCapitalEuro(oms);
  const positions = Array.isArray(oms?.positions) ? oms.positions : [];
  const exposures = positions.map((position) => ({
    currency: String(position?.currency || ""),
    notionalLocal: Math.abs(Number(position?.quantity || 0) * Number(position?.averagePrice || 0)),
    fxToEuro: position?.fxToEuro,
  }));
  const fxDecision = capitalEuro
    ? evaluateFxExposure(capitalEuro, exposures)
    : null;
  const fxExposureVerified = Boolean(
    latestFxRow
    && oms?.liveTradingAllowed === false
    && oms?.brokerConnectivityAllowed === false
    && foreignFillsCertified
    && fxDecision?.allowed === true,
  );

  const auditChain = Array.isArray(oms?.auditChain) ? oms.auditChain : [];
  const auditVerification = auditChain.length > 0
    ? verifyAuditChain(auditChain)
    : { valid: false, brokenAt: null };
  const auditedExecutionIds = new Set(auditChain.map((event) => String(event?.entityId || "")));
  const allExecutionsAudited = executions.length > 0
    && executions.every((execution) => auditedExecutionIds.has(String(execution?.clientOrderId || "")));
  const auditEvidenceDays = rows.filter((row) => safePaperLocks(row) && row?.auditChainValid === true).length;
  const persistentAuditRuntimeVerified = Boolean(
    oms?.liveTradingAllowed === false
    && oms?.brokerConnectivityAllowed === false
    && auditVerification.valid
    && allExecutionsAudited
    && rows.length > 0
    && auditEvidenceDays === rows.length,
  );

  return {
    marketSessionControlsVerified: Boolean(openSessionRow && blockedSessionRow),
    marketSessionEvidenceDate: latestSessionRow?.date || null,
    marketSessionOpenEvidenceDate: openSessionRow?.date || null,
    marketSessionBlockedEvidenceDate: blockedSessionRow?.date || null,
    marketSessionSource: latestSessionRow?.marketSession?.evidence?.source || null,
    fxExposureVerified,
    fxEvidenceDate: latestFxRow?.date || null,
    fxProvider: latestFxRow?.marketFxEvidence?.provider || null,
    fxCapitalEuro: capitalEuro,
    fxTotalForeignExposurePercent: fxDecision?.totalForeignExposurePercent ?? null,
    fxExposureReasons: fxDecision?.reasons ?? (capitalEuro ? [] : ["paper capital evidence unavailable"]),
    foreignPaperFills: foreignFills.length,
    certifiedForeignPaperFills: foreignFills.filter((execution) => certifiedForeignFillIds.has(String(execution?.clientOrderId || ""))).length,
    persistentAuditRuntimeVerified,
    auditChainEvents: auditChain.length,
    auditEvidenceDays,
    auditBrokenAt: auditVerification.brokenAt,
    allExecutionsAudited,
    failClosed: true,
  };
}
