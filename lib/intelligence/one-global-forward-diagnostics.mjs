// The first fully subsequent captured bar supplies a reference mark. The next
// 2, 10 or 40 captured bars measure direction, in the instrument's currency.
export const observedHorizons = [2, 10, 40];
const round = x => Math.round(x * 10000) / 10000;

export function firstAfter(bars, field, value) {
  let low = 0, high = bars.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (bars[middle][field] <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function tally() {
  return {eligible:0, measured:0, up:0, down:0, flat:0, returnSum:0, drawdownSum:0};
}
function add(group, result) {
  group.eligible++;
  if (!result) return;
  group.measured++;
  if (result.change > 0) group.up++;
  else if (result.change < 0) group.down++;
  else group.flat++;
  group.returnSum += result.change;
  group.drawdownSum += result.drawdown;
}
function render(group) {
  const {returnSum, drawdownSum, ...counts} = group;
  return {...counts, pending:group.eligible-group.measured,
    meanGrossLocalChangePct:group.measured ? round(returnSum/group.measured) : null,
    meanSampledMaxDrawdownPct:group.measured ? round(drawdownSum/group.measured) : null};
}

function subsequentResult(bars, start, horizon) {
  const exit = bars[start + horizon];
  if (!exit) return null;
  const entry = bars[start].close;
  let peak = entry, drawdown = 0;
  for (let index = start + 1; index <= start + horizon; index++) {
    const close = bars[index].close;
    peak = Math.max(peak, close);
    drawdown = Math.min(drawdown, 100 * (close / peak - 1));
  }
  return {knownAt:exit.recordedAt, entryAt:bars[start].barBucketAt, exitAt:exit.barBucketAt,
    change:100*(exit.close/entry-1), drawdown};
}

// Out-of-time diagnostic of a fixed historical-frequency benchmark. A label
// enters training only after its receipt, strictly before the next decision.
// Rolling windows can overlap. The scores cannot promote a trading strategy.
function pastFrequencyBenchmark(cases) {
  const chronological = [...cases].sort((a,b)=>a.at.localeCompare(b.at));
  const outcomes = chronological.filter(row=>row.knownAt!==null)
    .sort((a,b)=>a.knownAt.localeCompare(b.knownAt));
  const votes = new Map();
  const latestDecisionAt = chronological.at(-1)?.at ?? null;
  const latestGroups = new Map();
  let index=0, allWins=0, count=0, error=0, baselineError=0, available=0, pending=0;
  for (const row of chronological) {
    while (index < outcomes.length && outcomes[index].knownAt < row.at) {
      const past=outcomes[index++];
      const group=votes.get(past.group) ?? {n:0, wins:0};
      group.n++;
      group.wins+=past.win;
      allWins+=past.win;
      votes.set(past.group,group);
    }
    const group=votes.get(row.group);
    const enough=Boolean(group && group.n >= 30);
    if (row.at===latestDecisionAt) {
      const latest=latestGroups.get(row.group) ?? {decisions:0, priorOutcomes:group?.n??0,
        probability:enough?round(group.wins/group.n):null};
      latest.decisions++;
      latestGroups.set(row.group,latest);
    }
    if (!enough) continue;
    available++;
    if (row.knownAt===null) { pending++; continue; }
    count++;
    error+=(group.wins/group.n-row.win)**2;
    baselineError+=(allWins/index-row.win)**2;
  }
  return {benchmark:{tested:count, minPriorGroupOutcomes:30, brier:count?round(error/count):null,
    pooledBaselineBrier:count?round(baselineError/count):null},
    coverage:{model:"PAST_GROUP_FREQUENCY_V1",basis:"RECONSTRUCTED_AT_RECORDED_DECISION_TIME",
      totalDecisions:chronological.length, available, pending, scored:count,
      withheld:chronological.length-available, latestDecisionAt,
      latestGroups:Object.fromEntries(latestGroups), minimumPriorGroupOutcomes:30,
      overlappingSamplesPossible:true, recordedLiveForecast:false, researchOnly:true,
      executionEligible:false, liveTradingAllowed:false}};
}

const researchGroup = (row,horizon) => row.selected ? (horizon===40?row.medium:row.short) : "OUTSIDE_WATCHLIST";

// Fixed empirical baseline; no fitted parameters or committee scores are altered.
// Each outcome must have been received strictly BEFORE the forecast timestamp.
export function buildResearchFrequencyTraining(decisions, observations, cutoff) {
  const training = new Map();
  for (const horizon of observedHorizons) {
    const groups = new Map();
    for (const row of decisions) {
      if (row.at >= cutoff) continue;
      const bars=observations.get(row.key)?.get(row.currency)??[];
      const start=firstAfter(bars,"barBucketAt",row.at);
      const exit=bars[start+horizon];
      if (!exit || exit.recordedAt >= cutoff) continue;
      const group=researchGroup(row,horizon);
      const count=groups.get(group)??{n:0,wins:0};
      count.n++;
      if(exit.close>bars[start].close)count.wins++;
      groups.set(group,count);
    }
    training.set(horizon,groups);
  }
  return training;
}
export function issueResearchFrequencyForecasts(training,row,generatedAt,trainingTip) {
  return observedHorizons.flatMap(horizon=>{
    const group=researchGroup(row,horizon);
    const count=training.get(horizon)?.get(group);
    if(!count||count.n<30)return [];
    return [{model:"PAST_GROUP_FREQUENCY_V1",horizon,group,generatedAt,trainingTip,
      priorOutcomes:count.n,priorPositive:count.wins,probability:round(count.wins/count.n),
      researchOnly:true,executionEligible:false,liveTradingAllowed:false}];
  });
}

// Descriptive dependence diagnostic, not an effective sample-size estimate.
// Greedy earliest-finish interval scheduling counts disjoint windows within
// each instrument/currency; cross-instrument market dependence remains unknown.
function dependenceSummary(cases) {
  const complete=cases.filter(c=>c.knownAt!==null);
  const ordered=[...complete].sort((a,b)=>a.exitAt.localeCompare(b.exitAt)
    ||a.entryAt.localeCompare(b.entryAt)||a.instrument.localeCompare(b.instrument));
  const lastExit=new Map(), windows=new Set(), decisionDays=new Set(), exitDays=new Set();
  let disjoint=0;
  for(const c of ordered){
    const key=c.instrument;
    windows.add(JSON.stringify([key,c.entryAt,c.exitAt]));
    decisionDays.add(c.at.slice(0,10));
    exitDays.add(c.exitAt.slice(0,10));
    if(!lastExit.has(key)||c.entryAt>lastExit.get(key)){
      disjoint++;
      lastExit.set(key,c.exitAt);
    }
  }
  return {measured:complete.length,distinctInstruments:lastExit.size,distinctWindows:windows.size,
    disjointWithinInstrument:disjoint,overlappingOrRepeatedWindows:complete.length-disjoint,
    decisionUtcDays:decisionDays.size,exitUtcDays:exitDays.size};
}
function sampleDependence(cases){
  const groups=new Map();
  for(const c of cases){
    const a=groups.get(c.group)??[];
    a.push(c);groups.set(c.group,a);
  }
  return {overall:dependenceSummary(cases),
    byAttention:Object.fromEntries([...groups].map(([name,rows])=>[name,dependenceSummary(rows)])),
    method:"STRICT_DISJOINT_INSTRUMENT_CURRENCY_CAPTURED_BAR_WINDOWS",
    independentSamplesProven:false,effectiveSampleSize:null,
    researchOnly:true,changesForecastEligibility:false,strategyPromotionAllowed:false};
}

export function summarizeForwardDecisions(decisions, observations) {
  const result={};
  for (const horizon of observedHorizons) {
    const total=tally(), groups=new Map(), stages=new Map(), regimes=new Map(), cases=[];
    let issued=0, scored=0, brierSum=0;
    for (const row of decisions) {
      const bars=observations.get(row.key)?.get(row.currency) ?? [];
      const start=firstAfter(bars,"barBucketAt",row.at);
      const measurement=subsequentResult(bars,start,horizon);
      add(total,measurement);
      const groupName=researchGroup(row,horizon);
      const forecast=row.researchForecasts?.find(f=>f.horizon===horizon);
      if(forecast){
        issued++;
        if(measurement){scored++;brierSum+=(forecast.probability-Number(measurement.change>0))**2;}
      }
      for (const [table,name] of [[groups,groupName],[stages,row.stage],[regimes,row.regime]]) {
        if (!name) continue;
        if (!table.has(name)) table.set(name,tally());
        add(table.get(name),measurement);
      }
      cases.push({at:row.at,group:groupName,knownAt:measurement?.knownAt??null,
        instrument:JSON.stringify([row.key,row.currency]),entryAt:measurement?.entryAt??null,
        exitAt:measurement?.exitAt??null,win:measurement?Number(measurement.change>0):null});
    }
    const format=map=>Object.fromEntries([...map].map(([name,stats])=>[name,render(stats)]));
    const frequency=pastFrequencyBenchmark(cases);
    result[horizon]={...render(total), byAttention:format(groups), byStage:format(stages),
      byRegime:format(regimes), pastFrequencyBenchmark:frequency.benchmark,
      researchForecastCoverage:frequency.coverage,
      sampleDependence:sampleDependence(cases),
      persistedForecastEvaluation:{issued,scored,pending:issued-scored,brier:scored?round(brierSum/scored):null,
        researchOnly:true,netReturnCertified:false,executionEligible:false,liveTradingAllowed:false}};
  }
  return {horizons:result, entryBasis:"FIRST_CAPTURED_COMPLETED_BAR_STARTING_AFTER_DECISION",
    unit:"SUBSEQUENT_CAPTURED_BARS", costsAndFxIncluded:false, netReturnPct:null,
    portfolioDrawdownPct:null, strategyPromotionAllowed:false};
}
