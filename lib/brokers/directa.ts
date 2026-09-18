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
  apiAccessApproved: boolean;
  technicalContractVerified: boolean;
  missingRequirements: string[];
};

/**
 * Directa exposes Darwin APIs to approved account holders. Fenice deliberately
 * does not contain guessed endpoints, authentication fields or a network
 * transport until the official technical contract available to the account is
 * reviewed and mapped.
 */
export function getDirectaBridgeStatus(config: DirectaBridgeConfig = {}): DirectaBridgeStatus {
  const requestedMode = config.requestedMode ?? "paper";
  const apiAccessApproved = config.apiAccessApproved === true;
  const technicalContractVerified = config.technicalContractVerified === true;
  const missingRequirements: string[] = [];

  if (!apiAccessApproved) {
    missingRequirements.push("Directa API access has not been confirmed for the account.");
  }
  if (!technicalContractVerified) {
    missingRequirements.push("Directa official technical API contract has not been verified in Fenice.");
  }
  missingRequirements.push("Directa network transport is intentionally not implemented yet.");
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
    apiAccessApproved,
    technicalContractVerified,
    missingRequirements,
  };
}

export function prepareDirectaConnection(config: DirectaBridgeConfig = {}): DirectaBridgeStatus {
  return getDirectaBridgeStatus(config);
}

export async function connectDirectaNetwork(): Promise<never> {
  throw new Error(
    "DIRECTA_CONNECTION_BLOCKED: broker networking remains disabled until the official API contract is verified and Fenice governance permits broker connectivity.",
  );
}

export async function submitDirectaOrder(): Promise<never> {
  throw new Error(
    "FENICE_LIVE_TRADING_LOCKED: Directa order submission is intentionally not implemented or enabled.",
  );
}
