import { DIRECTA_CONTRACT_VERSION, DIRECTA_DEFAULT_TRADING_PORT } from "./directa-protocol.ts";

export type DirectaRequestedMode = "disabled" | "paper" | "read-only" | "live";

export type DirectaBridgeConfig = {
  requestedMode?: DirectaRequestedMode;
  apiAccessApproved?: boolean;
  technicalContractVerified?: boolean;
};

export type DirectaBridgeStatus = {
  brokerId: "directa";
  brokerName: "Directa SIM S.p.A.";
  requestedMode: DirectaRequestedMode;
  connectionState: "disabled" | "prepared" | "blocked";
  brokerRecognized: true;
  networkConnectionAllowed: false;
  liveTradingAllowed: false;
  orderSubmissionImplemented: false;
  readOnlyAdapterImplemented: true;
  localLoopbackOnly: true;
  defaultTradingPort: number;
  officialContractVersion: string;
  apiAccessApproved: boolean;
  technicalContractVerified: boolean;
  missingRequirements: string[];
};

export function getDirectaBridgeStatus(config: DirectaBridgeConfig = {}): DirectaBridgeStatus {
  const requestedMode = config.requestedMode ?? "paper";
  const apiAccessApproved = config.apiAccessApproved === true;
  const technicalContractVerified = config.technicalContractVerified === true;
  const missingRequirements: string[] = [];

  if (!apiAccessApproved) {
    missingRequirements.push("Directa API access has not been confirmed for the runtime account.");
  }
  if (!technicalContractVerified) {
    missingRequirements.push("Directa official technical API contract has not been marked verified in this runtime.");
  }
  if (requestedMode === "read-only") {
    missingRequirements.push("The read-only transport must run locally on the same machine as Darwin; cloud runtimes cannot access Darwin localhost.");
  }
  missingRequirements.push("Fenice live-trading release lock is closed.");

  return {
    brokerId: "directa",
    brokerName: "Directa SIM S.p.A.",
    requestedMode,
    connectionState:
      requestedMode === "disabled" ? "disabled" : requestedMode === "live" ? "blocked" : "prepared",
    brokerRecognized: true,
    networkConnectionAllowed: false,
    liveTradingAllowed: false,
    orderSubmissionImplemented: false,
    readOnlyAdapterImplemented: true,
    localLoopbackOnly: true,
    defaultTradingPort: DIRECTA_DEFAULT_TRADING_PORT,
    officialContractVersion: DIRECTA_CONTRACT_VERSION,
    apiAccessApproved,
    technicalContractVerified,
    missingRequirements,
  };
}

export function prepareDirectaConnection(config: DirectaBridgeConfig = {}): DirectaBridgeStatus {
  return getDirectaBridgeStatus(config);
}

/** Generic/cloud broker transport intentionally remains blocked. The only
 * implemented networking path is the separate localhost-only read-only bridge.
 */
export async function connectDirectaNetwork(): Promise<never> {
  throw new Error(
    "DIRECTA_CONNECTION_BLOCKED: generic/cloud broker networking is disabled. Use the localhost-only Directa read-only bridge beside Darwin.",
  );
}

export async function submitDirectaOrder(): Promise<never> {
  throw new Error(
    "FENICE_LIVE_TRADING_LOCKED: Directa order submission is intentionally not implemented or enabled.",
  );
}
