/** Public research snapshot only; not an authorization or PAPER data feed. */
export type PublicMissionSnapshotRead = {
  snapshot: unknown;
  source: 'BUNDLED' | 'GITHUB_MAIN_PUBLIC';
};
export declare function validPublicMissionSnapshot(value: unknown): boolean;
export declare function readLatestPublicMissionSnapshot(args?: {
  fallback: unknown;
  fetcher?: typeof fetch;
  nowMs?: number;
}): Promise<PublicMissionSnapshotRead>;
