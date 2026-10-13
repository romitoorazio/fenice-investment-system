import { assessHistoricalCredentialRotation } from "./credential-rotation-gate.mjs";

/**
 * FENICE100K release acceptance board. Display/diagnostic only.
 * This intentionally CANNOT certify PAPER, unlock LIVE, approve Directa
 * or promote research statistics into executable trading permission.
 *
 * Report generation times, GitHub CI records and market trade timestamps have
 * different meanings. Missing/future timestamps must fail closed.
 */
function observedAgeHours(iso, now) {
  if (typeof iso !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(iso)) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0,19) !== iso.slice(0,19) ||
    parsed > now || parsed < 946684800000) return null;
  return (now - parsed) / 3600000;
}
const int = n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
const positive = n => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
const horizon = (benchmark, key) => {
  const row = benchmark?.matured?.[key];
  return {pairs:int(row?.pairedSamples),independentDays:int(row?.independentEntryDays)};
};

export function assessFenice100KRelease({
  sourceHealth, committee, shadow, paperWindow,
  engineeringEvidence, paperApproval, now = new Date(),
} = {}) {
  const at = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(at) || at < 946684800000) throw Error("Invalid release assessment time");
  const sourceAge = observedAgeHours(sourceHealth?.generatedAt,at);
  const committeeAge = observedAgeHours(committee?.generatedAt,at);
  const engineeringAge = observedAgeHours(engineeringEvidence?.generatedAt,at);
  const sourceScore = positive(sourceHealth?.qualityScore);
  const analyzedSymbols = Array.isArray(committee?.allDecisions) ? committee.allDecisions.length : 0;
  const withTimestampedResearchQuote = Array.isArray(committee?.allDecisions)
    ? committee.allDecisions.filter(row => row?.priceEvidence?.evidenceType === "YAHOO_REGULAR_TRADE_META_RESEARCH_ONLY"
      && observedAgeHours(row.priceEvidence.observedAt,at) !== null
      && positive(row.priceEvidence.price) > 0
      && row.priceEvidence.executionEligible === false
      && row.priceEvidence.liveTradingAllowed === false).length : 0;
  const dataPass = sourceHealth?.gate === "GREEN" && sourceScore !== null && sourceScore >= 85
    && sourceAge !== null && sourceAge <= 24
    && committeeAge !== null && committeeAge <= 26 && analyzedSymbols > 0;

  const engineeringHistoricalPass = engineeringEvidence?.state === "VERIFIED"
    && engineeringEvidence?.source?.conclusion === "success"
    && engineeringEvidence?.source?.branch === "main"
    && engineeringEvidence?.policy?.liveTradingAllowed === false
    && engineeringEvidence?.policy?.brokerConnectivityAllowed === false
    && engineeringEvidence?.policy?.ciEvidenceCannotAuthorizeLive === true
    && engineeringAge !== null && engineeringAge <= 48;
  const researchRecords = int(shadow?.totalRecords) ?? 0;
  const b7 = horizon(shadow?.forwardBenchmark,"7d");
  const b30 = horizon(shadow?.forwardBenchmark,"30d");
  const edgeEvidenced = b7.pairs !== null && b7.independentDays !== null
    && b30.pairs !== null && b30.independentDays !== null
    && b7.pairs >= 30 && b7.independentDays >= 30
    && b30.pairs >= 30 && b30.independentDays >= 30;

  // A numerically mature historical sample would still need human review,
  // investability, buy-only attribution, and actual costs to prove alpha.
  const paperCertified = false; // This board cannot attest canonical PAPER authority.
  const paperDays = int(paperWindow?.verifiedEvidenceDays);
  const paperRequiredDays = int(paperWindow?.requiredEvidenceDays);
  const paperFills = int(paperWindow?.reportedFills);
  const paperRequiredFills = int(paperWindow?.requiredFills);
  const paperElapsedDays = int(paperWindow?.elapsedDays);
  const paperDuration = int(paperWindow?.requiredDays);
  const paperNumericalReady = paperWindow?.numericalTargetsMet === true && paperWindow?.evidenceIntegrityReviewRequired === false;

  const liveLocked = sourceHealth?.liveTradingAllowed !== true
    && engineeringEvidence?.policy?.liveTradingAllowed === false
    && paperApproval?.liveTradingAllowed === false
    && paperApproval?.brokerConnectivityAllowed === false
    && paperWindow?.liveTradingAllowed === false
    && shadow?.safety?.liveTradingAllowed === false
    && shadow?.safety?.brokerSubmissionAllowed === false;
  const credentialRotation = assessHistoricalCredentialRotation();
  const blocked = [];
  if (!credentialRotation.historicalExposureResolved)
    blocked.push({id:"P0_HISTORICAL_PROVIDER_KEYS_UNVERIFIED",severity:"P0",detail:credentialRotation.nextAction});
  if (!liveLocked) blocked.push({id:"P0_LIVE_GUARD_INCONSISTENT",severity:"P0",detail:"Bloccare i percorsi LIVE e broker; i gate di sicurezza non sono coerenti."});
  if (!dataPass) blocked.push({id:"P0_DATA_QUALITY_UNVERIFIED",severity:"P0",detail:"Aggiornare e riverificare fonte dati/Comitato: gate GREEN e rapporto non scaduto."});
  if (!engineeringHistoricalPass) blocked.push({id:"P0_ENGINEERING_CI_UNVERIFIED",severity:"P0",detail:"Eseguire e registrare i test di produzione su main, con protezioni PAPER/LIVE."});
  if (paperWindow?.evidenceIntegrityReviewRequired === true) blocked.push({id:"P0_PAPER_EVIDENCE_REVIEW",severity:"P0",detail:"Controllare integrità e riconciliazione della campagna PAPER senza modificare il baseline V6."});
  if (paperWindow?.deadlineBeforeMaturity === true || paperWindow?.preExpiryOperatorAttentionRequired === true)
    blocked.push({id:"P0_PAPER_APPROVAL_WINDOW",severity:"P0",detail:"Revisione umana prima della scadenza dell'autorizzazione per nuovi probe PAPER; nessun rinnovo implicito."});
  if (!paperNumericalReady || !paperCertified)
    blocked.push({id:"P0_PAPER_NOT_CERTIFIED",severity:"P0",detail:"Rispettare durata minima, giornate verificate e fill genuini; verificare separatamente tutti i gate canonici PAPER."});
  if (!edgeEvidenced)
    blocked.push({id:"P1_INSUFFICIENT_FORWARD_ALPHA",severity:"P1",detail:"Servono confronti SHADOW/SPY maturi con almeno 30 giornate iniziali indipendenti a 7 e 30 giorni."});
  blocked.push({id:"P1_BROKER_RECONCILIATION_UNVERIFIED",severity:"P1",detail:"Directa: verifica locale esplicita, solo lettura, di disponibilità, posizioni e riconciliazione; nessun broker write."});

  return {
    version:1,
    assessedAt:new Date(at).toISOString(),
    overall:!liveLocked?"SAFETY_BLOCKED":dataPass && engineeringHistoricalPass
      ?"RESEARCH_USABLE_NOT_CERTIFIED":"RESEARCH_CHECKS_INCOMPLETE",
    completeForRealCapital:false,
    verifiedProfit:false,
    brokerAccountReconciled:false,
    gates:{
      credentialRotation,
      dataQuality:{state:dataPass?"RESEARCH_DATA_CURRENT":"UNVERIFIED_OR_STALE",score:sourceScore,
        sourceReportAgeHours:sourceAge===null?null:Math.round(sourceAge*10)/10,
        committeeAgeHours:committeeAge===null?null:Math.round(committeeAge*10)/10,
        analyzedSymbols, timestampedSingleFamilyResearchQuotes:withTimestampedResearchQuote,
        note:"Qualità globale non equivale a quorum prezzi per esecuzione."},
      riskSystem:{state:engineeringHistoricalPass?"HISTORICAL_MAIN_CI_VERIFIED":"CI_EVIDENCE_STALE_OR_MISSING",
        validatedCommit:engineeringHistoricalPass?engineeringEvidence.source.validatedCommit:null,
        currentDeployedCommitVerified:false,
        note:"Il successo CI storico NON certifica il commit Vercel attuale."},
      paperCertification:{state:"NOT_CERTIFIED",verifiedEvidenceDays:paperDays,
        requiredEvidenceDays:paperRequiredDays,reportedFills:paperFills,requiredFills:paperRequiredFills,
        elapsedDays:paperElapsedDays,minimumDurationDays:paperDuration,
        earliestMaturityAt:paperWindow?.earliestMaturityAt??null,
        authorizationExpiresAt:paperWindow?.authorizationExpiresAt??null,
        numericalTargetsMet:paperNumericalReady,
        note:"Solo un processo canonico con evidenze genuine puo certificare PAPER; non questo cruscotto."},
      performance:{state:edgeEvidenced?"NUMERICALLY_MATURE_HUMAN_REVIEW_REQUIRED":"NOT_PROVEN",
        researchRecords, benchmark7d:b7,benchmark30d:b30,
        hasVerifiedRealizedProfit:false,
        note:"Nessuna strategia considerata profittevole solo per score, backtest o rendimenti teorici."},
      directa:{state:"LOCAL_READ_ONLY_NOT_VERIFIED",brokerWritesAllowed:false},
      liveLock:{state:liveLocked?"LOCKED":"SAFETY_FAILURE",liveOrdersAllowed:false}
    },
    blockers:blocked,
    safety:{
      diagnosticOnly:true,
      modifiesV6DecisionPolicy:false,
      paperCertificationEligible:false,
      brokerSubmissionAllowed:false,
      liveTradingAllowed:false,
      automaticPaperRenewalAllowed:false,
    },
  };
}
