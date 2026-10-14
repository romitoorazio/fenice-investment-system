import { getDirectaBridgeStatus } from "./directa.ts";
import { LIVE_TRADING_RELEASED } from "./safety.ts";

export type BrokerSlotId = "directa" | "etoro";
export type BrokerReadiness = {
  id: BrokerSlotId;
  label: string;
  mode: "LOCAL_READ_ONLY" | "DEMO_READ_ONLY_PLANNED";
  status: "PREPARED_UNVERIFIED" | "NOT_CONNECTED";
  readOnlyAdapterPrepared: boolean;
  accountConnectionVerified: boolean;
  accountDataAvailable: boolean;
  orderSubmissionEnabled: false;
  nextStep: string;
};

export type MultiBrokerReadiness = {
  version: 1;
  purpose: "RESEARCH_ONLY";
  verifiedBrokerConnections: number;
  accountTotalsAvailable: false;
  crossBrokerDataSharingEnabled: false;
  brokerOrderSubmissionEnabled: false;
  liveTradingReleased: boolean;
  brokers: BrokerReadiness[];
};

/**
 * Public, secret-free integration readiness. This is NOT an account sync, an
 * API credential probe, a portfolio snapshot or an authorization to trade.
 * Keep it separate from the frozen PAPER V6 broker/OMS baseline.
 */
export function buildMultiBrokerReadiness(): MultiBrokerReadiness {
  const directa = getDirectaBridgeStatus({ requestedMode: "read-only" });
  const brokers: BrokerReadiness[] = [
    {
      id: "directa",
      label: "Directa SIM",
      mode: "LOCAL_READ_ONLY",
      status: "PREPARED_UNVERIFIED",
      readOnlyAdapterPrepared: directa.readOnlyAdapterImplemented,
      accountConnectionVerified: false,
      accountDataAvailable: false,
      orderSubmissionEnabled: false,
      nextStep: "Verificare dal PC con Darwin aperto il ponte locale di sola lettura; il cloud non vede il conto.",
    },
    {
      id: "etoro",
      label: "eToro",
      mode: "DEMO_READ_ONLY_PLANNED",
      status: "NOT_CONNECTED",
      readOnlyAdapterPrepared: false,
      accountConnectionVerified: false,
      accountDataAvailable: false,
      orderSubmissionEnabled: false,
      nextStep: "Verificare idoneita API e condizioni; poi predisporre credenziali DEMO con permesso Read nei secrets, senza ordini.",
    },
  ];
  return {
    version: 1,
    purpose: "RESEARCH_ONLY",
    verifiedBrokerConnections: brokers.filter((broker) => broker.accountConnectionVerified).length,
    accountTotalsAvailable: false,
    crossBrokerDataSharingEnabled: false,
    brokerOrderSubmissionEnabled: false,
    liveTradingReleased: LIVE_TRADING_RELEASED,
    brokers,
  };
}
