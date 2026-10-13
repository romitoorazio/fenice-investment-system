import type { DirectaReadOnlySnapshot } from "../brokers/directa-readonly";
import type { BrokerReconciliationReport } from "../trading/broker-reconciliation";

/**
 * Independent and informational continuity assessment.
 * Never consumes secrets, submits an order, authorizes PAPER or bypasses LIVE lock.
 * Keep outside the frozen V6 trading/risk baseline.
 */
export type DirectaContinuityInput = {
  snapshot?: DirectaReadOnlySnapshot | null;
  reconciliation?: BrokerReconciliationReport | null;
  auditChainValid?: boolean;
  unresolvedInternalOrders?: number | null;
  ambiguousPriorExecution?: boolean;
  serviceInterruptionObserved?: boolean;
  operatorRecoveryReviewedAt?: string | null;
};

export type DirectaContinuityDecision = {
  state: "NOT_VERIFIED" | "RECOVERY_REVIEW_REQUIRED" | "READ_ONLY_VERIFIED";
  readOnlyEvidenceVerified: boolean;
  snapshotAgeSeconds: number | null;
  reasons: string[];
  paperOrdersAuthorized: false;
  brokerWritesAuthorized: false;
  liveTradingAllowed: false;
};

const MAX_SNAPSHOT_AGE_MS = 15_000;
const MAX_RECOVERY_REVIEW_AGE_MS = 15 * 60_000;

function timeMs(value: string | null | undefined): number {
  return typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
}

export function assessDirectaServiceContinuity(
  input: DirectaContinuityInput = {},
  nowMs: number = Date.now(),
): DirectaContinuityDecision {
  const reasons: string[] = [];
  const snapshot = input.snapshot;
  const clockValid = Number.isFinite(nowMs);
  const timestampMs = timeMs(snapshot?.generatedAt);
  const ageMs = clockValid ? nowMs - timestampMs : NaN;
  const ageOk = Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= MAX_SNAPSHOT_AGE_MS;

  if (!snapshot) {
    reasons.push("Nessuno snapshot Directa locale verificato: cloud e configurazione API non provano la connessione");
  } else {
    if (snapshot.source !== "directa-dapi-local"
      || snapshot.mode !== "read-only"
      || snapshot.host !== "loopback"
      || snapshot.liveTradingAllowed !== false
      || snapshot.writeCommandsBlocked !== true) {
      reasons.push("La barriera di sola lettura Directa non è comprovata");
    }
    if (snapshot.connection?.healthy !== true || snapshot.connection?.state !== "CONN_OK") {
      reasons.push("Connessione Directa non sana o stato non confermato");
    }
    if (!ageOk) reasons.push("Snapshot Directa assente, scaduto, futuro o orologio invalido");
    if (snapshot.diagnostics?.stockListComplete !== true || snapshot.diagnostics?.orderListComplete !== true
      || !snapshot.account || !snapshot.availability) {
      reasons.push("Evidenze contabili, ordini o posizioni Directa incomplete");
    }
    if (!Array.isArray(snapshot.errors) || snapshot.errors.length !== 0) {
      reasons.push("Protocollo Directa con errori o non verificabile");
    }
  }

  if (input.reconciliation?.balanced !== true) {
    reasons.push("Riconciliazione effettiva con Directa non verificata");
  }
  if (input.auditChainValid !== true) reasons.push("Catena audit non verificata");
  if (!Number.isSafeInteger(input.unresolvedInternalOrders) || Number(input.unresolvedInternalOrders) !== 0) {
    reasons.push("Esito ordini interni sconosciuto o ordini irrisolti");
  }
  if (input.ambiguousPriorExecution !== false) {
    reasons.push("Esito delle esecuzioni precedenti non escluso come ambiguo");
  }
  if (typeof input.serviceInterruptionObserved !== "boolean") {
    reasons.push("Stato incidenti del broker non attestato");
  } else if (input.serviceInterruptionObserved) {
    const reviewedMs = timeMs(input.operatorRecoveryReviewedAt);
    if (!clockValid || !Number.isFinite(reviewedMs)
      || reviewedMs < timestampMs || reviewedMs > nowMs
      || nowMs - reviewedMs > MAX_RECOVERY_REVIEW_AGE_MS) {
      reasons.push("Dopo il disservizio serve revisione umana datata e successiva al nuovo snapshot");
    }
  }

  const readOnlyEvidenceVerified = reasons.length === 0;
  return {
    state: readOnlyEvidenceVerified ? "READ_ONLY_VERIFIED"
      : snapshot ? "RECOVERY_REVIEW_REQUIRED" : "NOT_VERIFIED",
    readOnlyEvidenceVerified,
    snapshotAgeSeconds: Number.isFinite(ageMs) && ageMs >= 0 ? Number((ageMs / 1000).toFixed(2)) : null,
    reasons,
    paperOrdersAuthorized: false,
    brokerWritesAuthorized: false,
    liveTradingAllowed: false,
  };
}
