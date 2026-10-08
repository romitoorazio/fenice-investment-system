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
    readyAtFill?: boolean;
    matches?: boolean;
  }>;
};

type PaperEvidenceRow = {
  date?: string;
  observedAt?: string;
  liveTradingAllowed?: boolean;
  brokerConnectivityAllowed?: boolean;
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
  const state = String(session?.evidence?.state || "").trim();
  const source = String(session?.evidence?.source || "").trim();
  const observedAt = Date.parse(String(session?.evidence?.observedAt || ""));
  return safePaperLocks(row)
    && session?.configured === true
    && session?.evidence?.authoritative === true
    && state.length > 0
    && source.length > 0
    && Number.isFinite(observedAt)
    && typeof session?.decision?.allowed === "boolean";
}

function validFxEvidence(row: PaperEvidenceRow) {
  const fx = row?.marketFxEvidence;
  const rate = Number(fx?.usdRate);
  const observedAt = Date.parse(String(fx?.usdObservedAt || ""));
  const provider = String(fx?.provider || "").trim().toLowerCase();
  const expectedProvider = String(fx?.expectedProvider || provider).trim().toLowerCase();
  const windows = Array.isArray(row?.fillEvidenceProof?.windows) ? row.fillEvidenceProof.windows : [];
  const hasMatchedNonEuroFillProof = windows.some((window) => {
    const proof = window?.marketFx;
    const nonEuroFills = Number(proof?.nonEuroFills || 0);
    const matched = Number(proof?.matchedNonEuroFills || 0);
    const proofs = Array.isArray(proof?.proofs) ? proof.proofs : [];
    return proof?.ready === true
      && proof?.requiredForAdditionalFills === true
      && nonEuroFills > 0
      && matched === nonEuroFills
      && proofs.length === nonEuroFills
      && proofs.every((item) => item?.readyAtFill === true && item?.matches === true);
  });

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
    && Number.isFinite(observedAt)
    && row?.fillEvidenceProof?.complete === true
    && hasMatchedNonEuroFillProof;
}

export function derivePaperRuntimeEvidence(campaign: PaperCampaignLike | null | undefined) {
  const rows = Array.isArray(campaign?.dailyEvidence)
    ? [...campaign.dailyEvidence].sort((a, b) => evidenceTime(a) - evidenceTime(b))
    : [];
  const newestFirst = [...rows].reverse();
  const sessionRow = newestFirst.find(validSessionEvidence);
  const fxRow = newestFirst.find(validFxEvidence);

  return {
    marketSessionControlsVerified: Boolean(sessionRow),
    marketSessionEvidenceDate: sessionRow?.date || null,
    marketSessionSource: sessionRow?.marketSession?.evidence?.source || null,
    fxExposureVerified: Boolean(fxRow),
    fxEvidenceDate: fxRow?.date || null,
    fxProvider: fxRow?.marketFxEvidence?.provider || null,
    failClosed: true,
  };
}
