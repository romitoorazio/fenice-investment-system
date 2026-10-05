export function evaluateDecisionDataGate(input?: {
  sourceHealth?: unknown;
  intelligence?: unknown;
  now?: number;
  maxAgeMinutes?: number;
}): {
  ready: boolean;
  sourceReady: boolean;
  dataReady: boolean;
  reasons: string[];
};
