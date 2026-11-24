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
  return {knownAt:exit.recordedAt, change:100*(exit.close/entry-1), drawdown};
}

// Out-of-time diagnostic of a fixed historical-frequency benchmark. A label
// enters training only after its receipt, strictly before the next decision.
// Rolling windows can overlap. The scores cannot promote a trading strategy.
function pastFrequencyBenchmark(cases) {
  const outcomes = [...cases].sort((a,b)=>a.knownAt.localeCompare(b.knownAt));
  const votes = new Map();
  let index=0, allWins=0, count=0, error=0, baselineError=0;
  for (const row of cases) {
    while (index < outcomes.length && outcomes[index].knownAt < row.at) {
      const past=outcomes[index++];
      const group=votes.get(past.group) ?? {n:0, wins:0};
      group.n++;
      group.wins+=past.win;
      allWins+=past.win;
      votes.set(past.group,group);
    }
    const group=votes.get(row.group);
    if (!group || group.n < 30) continue;
    count++;
    error+=(group.wins/group.n-row.win)**2;
    baselineError+=(allWins/index-row.win)**2;
  }
  return {tested:count, minPriorGroupOutcomes:30, brier:count?round(error/count):null,
    pooledBaselineBrier:count?round(baselineError/count):null};
}

export function summarizeForwardDecisions(decisions, observations) {
  const result={};
  for (const horizon of observedHorizons) {
    const total=tally(), groups=new Map(), stages=new Map(), regimes=new Map(), cases=[];
    for (const row of decisions) {
      const bars=observations.get(row.key)?.get(row.currency) ?? [];
      const start=firstAfter(bars,"barBucketAt",row.at);
      const measurement=subsequentResult(bars,start,horizon);
      add(total,measurement);
      const groupName=row.selected ? (horizon===40?row.medium:row.short) : "OUTSIDE_WATCHLIST";
      for (const [table,name] of [[groups,groupName],[stages,row.stage],[regimes,row.regime]]) {
        if (!name) continue;
        if (!table.has(name)) table.set(name,tally());
        add(table.get(name),measurement);
      }
      if (measurement) cases.push({at:row.at,group:groupName,knownAt:measurement.knownAt,
        win:Number(measurement.change>0)});
    }
    const format=map=>Object.fromEntries([...map].map(([name,stats])=>[name,render(stats)]));
    result[horizon]={...render(total), byAttention:format(groups), byStage:format(stages),
      byRegime:format(regimes), pastFrequencyBenchmark:pastFrequencyBenchmark(cases)};
  }
  return {horizons:result, entryBasis:"FIRST_CAPTURED_COMPLETED_BAR_STARTING_AFTER_DECISION",
    unit:"SUBSEQUENT_CAPTURED_BARS", costsAndFxIncluded:false, netReturnPct:null,
    portfolioDrawdownPct:null, strategyPromotionAllowed:false};
}
