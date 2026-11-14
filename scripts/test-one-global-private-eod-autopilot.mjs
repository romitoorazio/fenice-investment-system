import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal} from '../lib/trading/one-global-eod-paper.mjs';
import {privateEodNewYorkClock,planPrivateEodSignalCycle} from '../lib/trading/one-global-private-eod-autopilot.mjs';
const initial=newOneGlobalEodPaperLedger();
const friday='2026-11-13T22:45:00.000Z'; // Fri 17:45 EST
const w=planPrivateEodSignalCycle({nowIso:friday,originalLedger:initial});
assert.equal(w.sessionDate,'2026-11-13');
assert.equal(w.expectedPostcloseWindow,true);
assert.deepEqual(w.candidates.map(x=>x.symbol),['AAPL','MSFT','TSLA']);
assert.equal(w.candidates.filter(x=>x.eligible).length,3);
assert.equal(w.actualExchangeSessionProven,false);
assert.equal(w.paperFillsCreated,0);
assert.equal(w.certifiedTrades,0);
assert.equal(w.liveTradingAllowed,false);
assert.equal(planPrivateEodSignalCycle({nowIso:'2026-11-13T20:35:00.000Z',
  originalLedger:initial}).candidates[0].reason,'NOT_IN_NY_POSTCLOSE_WINDOW');
assert.equal(planPrivateEodSignalCycle({nowIso:'2026-11-14T22:45:00.000Z',
  originalLedger:initial}).expectedPostcloseWindow,false);
assert.equal(planPrivateEodSignalCycle({nowIso:'2026-11-13T23:56:00.000Z',
  originalLedger:initial}).expectedPostcloseWindow,false);
const summer='2026-07-10T21:45:00.000Z'; // Fri 17:45 EDT
assert.equal(privateEodNewYorkClock(summer).sessionDate,'2026-07-10');
assert.equal(planPrivateEodSignalCycle({nowIso:summer,originalLedger:initial})
  .expectedPostcloseWindow,true,'NY DST must preserve the same session-local window');
assert.throws(()=>planPrivateEodSignalCycle({nowIso:friday,originalLedger:initial,
  symbols:['AAPL','AAPL']}),/SYMBOL_UNIVERSE_INVALID/);
assert.throws(()=>planPrivateEodSignalCycle({nowIso:friday,originalLedger:initial,
  symbols:['CBA']}),/SYMBOL_UNIVERSE_INVALID/);
assert.throws(()=>planPrivateEodSignalCycle({nowIso:'bad',originalLedger:initial}),
  /CLOCK_INVALID/);
const corrupted={...initial,cashEuro:0};
assert.throws(()=>planPrivateEodSignalCycle({nowIso:friday,
  originalLedger:corrupted}),/LEDGER_REPLAY_ACCOUNT_MISMATCH/);

const at='2026-11-13T22:30:00.000Z';
const {ledger}=recordOneGlobalEodSignal({
  previousLedger:initial,nowIso:at,signal:{
    signalId:'fenice-xnas-aapl-20261113-eod-research',
    key:'XNAS:AAPL',mic:'XNAS',side:'BUY',currency:'USD',
    decisionAt:at,referenceSessionDate:'2026-11-13',
    referenceCloseAt:'2026-11-13T21:00:00.000Z',
    referencePublishedAt:'2026-11-13T21:35:00.000Z',
    sourceSnapshotHash:'a'.repeat(64),maxNotionalEuro:50,
    strategyReason:'UPTREND_CONFIRMATION',
    researchSignalOnly:true,sourceRightsIndependentlyCertified:false,
  }
});
const w2=planPrivateEodSignalCycle({nowIso:friday,originalLedger:ledger});
assert.equal(w2.candidates[0].reason,'SIGNAL_ALREADY_PENDING');
assert.equal(w2.candidates[0].eligible,false);
assert.equal(w2.candidates[1].eligible,true);
assert.equal(initial.events.length,0,'planner must not mutate original journal');

const script=resolve('scripts/run-one-global-private-eod-autopilot.mjs');
const help=execFileSync(process.execPath,[script,'--help'],{encoding:'utf8'});
assert.match(help,/NO BROKER/);
const tmp=mkdtempSync(join(tmpdir(),'fenice-autopilot-test-'));
try{
  const path=join(tmp,'original-private-ledger.json');
  writeFileSync(path,JSON.stringify(initial),'utf8');
  const originalBytes=readFileSync(path,'utf8');
  // Explicitly clear the API key; tests NEVER contact a data provider, even
  // when CI happens to have an existing personal API token in its environment.
  const env={...process.env,ALPHA_VANTAGE_API_KEY:''};
  for(const flags of [[],['--commit']]){
    const exec=spawnSync(process.execPath,[script,'--ledger='+path,...flags],
      {env,encoding:'utf8',timeout:10000});
    assert.equal(exec.status,0,exec.stderr);
    const result=JSON.parse(exec.stdout.trim());
    assert.equal(result.paperFillsCreated,0);
    assert.equal(result.signalAppended,false);
    assert.equal(result.realBrokerOrders,0);
    assert.equal(result.liveTradingAllowed,false);
    assert.equal(readFileSync(path,'utf8'),originalBytes,
      'missing provider key must never modify the original journal');
  }
  const missing=spawnSync(process.execPath,[script,'--ledger='+join(tmp,'missing.json'),'--commit'],
    {env,encoding:'utf8',timeout:10000});
  assert.notEqual(missing.status,0);
  assert.match(missing.stderr,/ORIGINAL_LEDGER_REQUIRED_NO_RESET/);
  assert.equal(existsSync(join(tmp,'missing.json')),false);
  const bad=spawnSync(process.execPath,[script,'--ledger='+path,'--symbols=AAPL,AAPL'],
    {env,encoding:'utf8',timeout:10000});
  assert.notEqual(bad.status,0);
  assert.match(bad.stderr,/SYMBOL_UNIVERSE_INVALID/);
}finally{rmSync(tmp,{recursive:true,force:true});}
console.log('PASS private FENICE EOD signal autopilot: NY/DST weekend, limits, no reset, no secrets, private original replay, no Directa/fills.');
