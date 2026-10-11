/**
 * Fenice grounded research interpreter. Zero network/provider calls, no LLM
 * impersonation, no execution authority. Deterministic, auditable outputs only.
 */
export type CommitteeAsset = {
  symbol: string;
  name?: string;
  rank?: number;
  decision?: string;
  terminalDecision?: string;
  committeeScore?: number;
  confidence?: number;
  riskScore?: number;
  currency?: string;
  currentPrice?: number;
  bullCase?: string[];
  bearCase?: string[];
  invalidation?: string[];
  reviewTriggers?: string[];
  entryPlan?: { orderMode?: string; firstTrancheEuro?: number; maxEntryPrice?: number | null };
};
export type CommitteeSnapshot = {
  generatedAt?: string;
  executionGate?: string;
  buyCandidateCount?: number;
  marketRegime?: string;
  dataQuality?: number;
  sourceGate?: string;
  allDecisions?: CommitteeAsset[];
};
export type QualitySnapshot = { generatedAt?: string; intelligenceConfidence?: number };
export type SourceSnapshot = {
  generatedAt?: string;
  gate?: string;
  totalSources?: number;
  critical?: { gate?: string; ready?: number; total?: number };
  summary?: { healthy?: number; degraded?: number; failed?: number; unconfigured?: number };
};
export type CampaignSnapshot = {
  startedAt?: string;
  requiredDays?: number;
  minEvidenceDays?: number;
  minPaperFills?: number;
  dailyEvidence?: Array<{ date?: string; cumulativePaperFilled?: number }>;
};
export type CalibrationSnapshot = { horizons?: Record<string, { state?: string; sampleSize?: number }> };
export type AnalystContext = {
  committee: CommitteeSnapshot;
  quality: QualitySnapshot;
  sources: SourceSnapshot;
  campaign: CampaignSnapshot;
  calibration: CalibrationSnapshot;
};
export type AnalystReply = {
  intent: "MARKET" | "SYMBOL" | "RISK" | "PAPER" | "PERFORMANCE" | "UNSUPPORTED";
  verdict: string;
  title: string;
  paragraphs: string[];
  blockers: string[];
  evidence: Array<{ label: string; value: string; source: string }>;
  links: Array<{ label: string; href: string }>;
  sourceTimestamp: string | null;
  generatedAt: string;
  providerCalls: 0;
  evidenceQualityVerified: boolean;
  generativeModelConnected: false;
  brokerOrderAllowed: false;
};

const MAX_RESEARCH_AGE_MS = 36 * 60 * 60 * 1000;
const MAX_INPUT_LENGTH = 240;
const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
const plain = (value: unknown, fallback = "non verificato") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

function timestamp(value: unknown, now: number): number | null {
  if (typeof value !== "string" || !Number.isFinite(now)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= now ? parsed : null;
}
function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function cleanLines(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map(x => x.trim().slice(0, 260)).slice(0, 3);
}
function normalized(query: string) {
  return query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function querySymbol(query: string, assets: CommitteeAsset[]): CommitteeAsset | undefined {
  const name = normalized(query);
  return assets.find(asset => {
    const symbol = String(asset.symbol || "").toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._:/-]{0,39}$/.test(symbol)) return false;
    const symbolRe = new RegExp("(^|[^a-zA-Z0-9])" + symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=$|[^a-zA-Z0-9])", "i");
    if (symbolRe.test(query)) return true;
    const company = plain(asset.name, "").toLowerCase();
    return company.length >= 5 && name.includes(company);
  });
}
function showNumber(value: unknown, suffix = "") {
  const n = safeNumber(value);
  return n === null ? "N/D" : String(n) + suffix;
}
function latestCampaign(campaign: CampaignSnapshot) {
  const rows = Array.isArray(campaign.dailyEvidence) ? campaign.dailyEvidence : [];
  return rows.length > 0 ? rows[rows.length - 1] : undefined;
}
const sources = {
  committee: "data/investment-committee.json",
  quality: "data/intelligence-quality.json",
  sourceHealth: "data/global-source-health.json",
  paper: "data/paper-validation-campaign.json",
  calibration: "data/calibration-analysis.json",
} as const;
const safetyLinks = [
  { label: "Compra/Vendi", href: "/decisioni" },
  { label: "Sicurezza", href: "/readiness" },
  { label: "Risultati", href: "/performance" },
];

export function answerFeniceResearch(question: string, input: AnalystContext, now: number): AnalystReply {
  const safeNow = Number.isFinite(now) && now >= 0 ? now : 0;
  const time = new Date(safeNow).toISOString();
  const query = typeof question === "string" ? question.slice(0, MAX_INPUT_LENGTH).trim() : "";
  const lower = normalized(query);
  const committee = input?.committee ?? {};
  const quality = input?.quality ?? {};
  const sourceHealth = input?.sources ?? {};
  const campaign = input?.campaign ?? {};
  const calibration = input?.calibration ?? {};
  const snapshotAt = timestamp(committee.generatedAt, safeNow);
  const current = snapshotAt !== null && safeNow - snapshotAt <= MAX_RESEARCH_AGE_MS;
  const qualityAt = timestamp(quality.generatedAt, safeNow);
  const healthAt = timestamp(sourceHealth.generatedAt, safeNow);
  const latestQuality = qualityAt !== null && safeNow - qualityAt <= MAX_RESEARCH_AGE_MS;
  const latestHealth = healthAt !== null && safeNow - healthAt <= MAX_RESEARCH_AGE_MS;
  const criticalReady = sourceHealth.critical?.gate === "GREEN"
    && typeof sourceHealth.critical.ready === "number"
    && sourceHealth.critical.ready > 0
    && sourceHealth.critical.ready === sourceHealth.critical.total;
  const dataGuard = current && latestQuality && latestHealth && criticalReady
    && (safeNumber(quality.intelligenceConfidence) ?? 0) >= 90
    && committee.sourceGate === "GREEN";
  const operationalStudyOnly = dataGuard && committee.executionGate === "PRONTO_CON_CONFERMA"
    && (safeNumber(committee.buyCandidateCount) ?? 0) > 0;
  const assets = Array.isArray(committee.allDecisions) ? committee.allDecisions : [];
  const asset = querySymbol(query, assets);

  const base = {
    sourceTimestamp: current ? committee.generatedAt! : null,
    generatedAt: time,
    providerCalls: 0 as const,
    evidenceQualityVerified: dataGuard,
    generativeModelConnected: false as const,
    brokerOrderAllowed: false as const,
  };
  const evidence = [
    { label: "Decisione finale comitato", value: plain(committee.executionGate), source: sources.committee },
    { label: "Qualità intelligence", value: showNumber(quality.intelligenceConfidence, "/100"), source: sources.quality },
    { label: "Fonte critica", value: latestHealth ? plain(sourceHealth.critical?.gate) : "SCADUTA", source: sources.sourceHealth },
    { label: "Ultimo comitato", value: current ? committee.generatedAt! : "SCADUTO / NON VALIDO", source: sources.committee },
  ];
  const commonBlockers = [
    ...(!current ? ["Comitato non aggiornato o timestamp futuro/non valido."] : []),
    ...(!latestQuality ? ["Valutazione intelligence non aggiornata."] : []),
    ...(!latestHealth || !criticalReady ? ["Quorum delle fonti critiche non verificato ora."] : []),
    ...(current && latestQuality && latestHealth && !dataGuard ? ["Qualità complessiva delle evidenze insufficiente per generare una nuova analisi IA."] : []),
    ...(!operationalStudyOnly ? ["Nessuna proposta di acquisto operativa verificata dal comitato."] : []),
    "Trading reale Directa bloccato: questo analista non invia ordini.",
  ];
  const go = (intent: AnalystReply["intent"], verdict: string, title: string, paragraphs: string[],
    blockers = commonBlockers, extra: AnalystReply["evidence"] = [], links = safetyLinks): AnalystReply => ({
    ...base, intent, verdict, title, paragraphs, blockers, evidence: [...evidence, ...extra], links,
  });

  // Unknown free-text prompts are not passed to external models or providers.
  if (!query || /^(stato|oggi|panoramica|cosa fare|che fare|migliori|opportunita|mercato|comprare|compra|investire)/.test(lower)
    && !asset) {
    const buys = assets.filter(a => a.decision === "COMPRA").length;
    const obs = assets.filter(a => a.decision === "OSSERVA").length;
    return go("MARKET", "NESSUN ORDINE REALE", "Analisi quotidiana Fenice",
      [
        `Il comitato ha esaminato ${assets.length} titoli: ${buys} segnali COMPRA finali e ${obs} da osservare. Stato: ${plain(committee.executionGate)}.`,
        operationalStudyOnly
          ? "Esistono candidati di studio con condizioni del comitato; servono comunque quote, risk gate, posizione broker e autorizzazione umana. Nessun ordine è inviabile da qui."
          : "La decisione prudente è attendere: non è dimostrata una nuova operazione finanziaria autorizzabile.",
        `Regime valutato: ${plain(committee.marketRegime)}. Dati del comitato: ${current ? "recenti per ricerca (NON prezzi in tempo reale)" : "SCADUTI"}.`,
      ], commonBlockers,
      [{ label: "Titoli esaminati", value: String(assets.length), source: sources.committee }]);
  }
  if (asset) {
    const decision = plain(asset.decision, "ATTENDI");
    const validSymbol = current && dataGuard;
    const isBuyResearch = decision === "COMPRA" && operationalStudyOnly
      && asset.entryPlan?.orderMode === "LIMITE"
      && (safeNumber(asset.entryPlan?.firstTrancheEuro) ?? 0) > 0;
    const buy = /compr|acquist|entra|invest|quando/i.test(lower);
    const sell = /vend|uscir|riduc|exit|stop loss/i.test(lower);
    const bear = cleanLines(asset.bearCase);
    const bull = cleanLines(asset.bullCase);
    const invalidations = cleanLines(asset.invalidation);
    const paragraphs = [
      `${asset.symbol} (${plain(asset.name)}): decisione finale ${validSymbol ? decision : "NON VERIFICATA"}; tecnico ${plain(asset.terminalDecision)}. Sono valutazioni di ricerca, non quotazioni eseguibili.`,
      buy
        ? isBuyResearch
          ? "Il comitato consente soltanto di studiare un ingresso condizionato, NON un acquisto reale; verifiche di esecuzione e conferma umana restano necessarie."
          : "NON COMPRARE sulla base di questo dato: il comitato e/o la qualità richiesta non hanno convalidato un ingresso eseguibile."
        : sell ? "Non posso indicare VENDI senza prova della posizione effettivamente detenuta su Directa, costi e risk check."
          : `Tesi positiva: ${bull.join(" ") || "Non documentata."}`,
      `Controtesi: ${bear.join(" ") || "Non documentata."}`,
      `Invalidazione da sorvegliare: ${invalidations.join(" ") || "Non documentata: nessun livello stop inventato."}`,
    ];
    const blockers = [
      ...commonBlockers,
      ...(!isBuyResearch ? ["Comitato: nessun piano di ingresso verificato per questo titolo."] : []),
      ...(sell ? ["Posizione reale, quantità e prezzo di carico non attestati."] : []),
    ];
    return go("SYMBOL", isBuyResearch ? "SOLO STUDIO" : "ATTENDERE", `Fenice analizza ${asset.symbol}`,
      paragraphs, blockers,
      [
        { label: "Decisione finale", value: decision, source: sources.committee },
        { label: "Segnale tecnico (non autorizzativo)", value: plain(asset.terminalDecision), source: sources.committee },
        { label: "Punteggio comitato", value: showNumber(asset.committeeScore, "/100"), source: sources.committee },
        { label: "Confidenza stimata", value: showNumber(asset.confidence, "/100"), source: sources.committee },
        { label: "Rischio stimato", value: showNumber(asset.riskScore, "/100"), source: sources.committee },
      ],
      [{ label: "Compra/Vendi", href: "/decisioni" }, { label: "Risultati", href: "/performance" }]);
  }
  if (/risk|risch|sicurez|font|qualita|affidabil|concentraz|scadut/.test(lower)) {
    return go("RISK", "CONTROLLI ATTIVI", "Rischi e qualità dati",
      [
        `Intelligence: ${showNumber(quality.intelligenceConfidence, "/100")}. Fonti sane: ${showNumber(sourceHealth.summary?.healthy)}/${showNumber(sourceHealth.totalSources)}.`,
        `Critiche ${showNumber(sourceHealth.critical?.ready)}/${showNumber(sourceHealth.critical?.total)}; stato ${latestHealth ? plain(sourceHealth.critical?.gate) : "non verificato ora"}.`,
        "La salute delle fonti non sostituisce prezzi eseguibili, cambio, sessione del mercato, riconciliazione e rischio. Un segnale di ricerca non autorizza BUY.",
      ], commonBlockers);
  }
  if (/paper|certific|simulat|fill|giorni|approvaz/.test(lower)) {
    const last = latestCampaign(campaign);
    const days = new Set((campaign.dailyEvidence ?? []).map(row => row.date).filter(Boolean)).size;
    return go("PAPER", "CERTIFICAZIONE IN CORSO", "Certificazione simulata",
      [
        `Prove datate: ${days}/${showNumber(campaign.minEvidenceDays)}. Fill registrati: ${showNumber(last?.cumulativePaperFilled)}/${showNumber(campaign.minPaperFills)}. Durata obbligatoria: ${showNumber(campaign.requiredDays)} giorni completi.`,
        "Questi contatori sono prove archiviate, non verifica automatica di profittabilità né autorizzazione al live.",
        "La scadenza dell'approvazione deve essere verificata separatamente nella schermata Sicurezza.",
      ], commonBlockers, [
        { label: "Ultima evidenza", value: plain(last?.date), source: sources.paper },
      ], [{ label: "Sicurezza PAPER", href: "/readiness" }]);
  }
  if (/rendiment|guadagn|profit|strateg|backtest|benchmark|performance|calibraz/.test(lower)) {
    const calibration30 = calibration.horizons?.["30d"];
    return go("PERFORMANCE", "PROFITTO NON DIMOSTRATO", "L'IA non deve inventare rendimenti",
      [
        `Calibrazione acquisti 30 giorni: ${plain(calibration30?.state, "INSUFFICIENTE")} con ${showNumber(calibration30?.sampleSize)} campioni.`,
        "Senza track record netti fuori campione, costi reali, prezzi di chiusura verificati e benchmark omogeneo non si può dichiarare che Fenice batta il mercato.",
        "Gli score elevati dei titoli non corrispondono a utili reali. Le operazioni PAPER restano simulate.",
      ], commonBlockers, [
        { label: "Calibrazione", value: plain(calibration30?.state), source: sources.calibration },
      ], [{ label: "Performance Center", href: "/performance" }]);
  }
  const hints = ["stato Fenice oggi", "perché non comprare ASML?", "controlla i rischi", "certificazione PAPER", "guadagni e performance"];
  return go("UNSUPPORTED", "DOMANDA DA PRECISARE", "Domanda non verificabile dai dati disponibili",
    [
      "Questo analista legge solo le evidenze salvate da Fenice. Non inventa analisi di titoli non censiti, prezzi live o notizie.",
      "Puoi chiedere: " + hints.join("; ") + ".",
      "Per risposte generative libere serve un modello LLM realmente configurato, con budget, autenticazione e autorizzazione separati.",
    ], commonBlockers);
}
