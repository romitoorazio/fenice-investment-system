import type {AnalystContext} from "./fenice-grounded-analyst";
export function readCurrentPublicCommitteeContext(options?: {
  nowMs?: number;
  fetcher?: typeof fetch;
}): Promise<Pick<AnalystContext,"committee"|"quality"|"sources">>;
