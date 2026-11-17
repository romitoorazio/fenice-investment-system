/** Server-only entry point; all public consumers share the same projection. */
import terminal from '@/data/terminal-intelligence.json';
import ledger from '@/data/one-global-forward-research-ledger.json';
import health from '@/data/global-source-health.json';
import eod from '@/data/world-v7-eod-research.json';
import master from '@/data/instrument-master.json';
import seeds from '@/data/world-paper-v7-research-seeds.json';
import {readLatestWorldTacticalEvidence} from './one-global-world-radar-runtime.mjs';
export async function getWorldTacticalEvidence(){
  return readLatestWorldTacticalEvidence({fallback:{terminal,ledger,health,eod,master,seeds},
    nowIso:new Date().toISOString()});
}
