export type WorldPaperV7Instrument = {
  ticker: string; exchangeMic?: string; currency: string; region: string;
  country?: string; status: string; assetClass: string;
};
export type WorldPaperV7Listing = {
  key: string; symbol: string; mic: string; country?: string; region: string;
  currency: string; ready: boolean; reasons: string[];
  independentFamilies: string[]; verifiedPrice: number | null; fxToEuro: number | null;
  sessionObservedAt: string | null;
};
export type WorldPaperV7Region = {
  region: string; listedInPilot: number; verifiedPaperListings: number;
  blockedListings: number; simulatedFills: number;
};
export type WorldPaperV7Result = {
  version: 1;
  mode: "WORLD_PAPER_V7_ISOLATED";
  generatedAt: string;
  paperRunAuthorized: boolean;
  liveTradingAllowed: false;
  brokerConnectivityAllowed: false;
  modifiesV6: false;
  sourceRightsUnverifiedByDefault: true;
  controls: Record<string, number>;
  summary: {
    pilotListings: number; regions: number; independentlyVerifiedListings: number;
    proposedIntents: number; filledPaperOrders: number; rejectedIntents: number;
  };
  regions: WorldPaperV7Region[];
  listings: WorldPaperV7Listing[];
  fills: Array<Record<string, unknown>>;
  rejectedIntents: Array<{ intentId: string | null; key: string; reasons: string[] }>;
  paperLedger: { cashEuro: number; positions: Record<string, { quantity: number; unitCostEuro: number }>; events: unknown[]; lastHash: string };
};
export declare function runWorldPaperV7(input?: {
  instruments?: WorldPaperV7Instrument[];
  sessions?: Array<Record<string, unknown>>;
  quotes?: Array<Record<string, unknown>>;
  fx?: Array<Record<string, unknown>>;
  entitlements?: Record<string, unknown>;
  intents?: Array<Record<string, unknown>>;
  previousLedger?: Record<string, unknown> | null;
  paperRunAuthorized?: boolean;
  nowIso?: string;
}): WorldPaperV7Result;
