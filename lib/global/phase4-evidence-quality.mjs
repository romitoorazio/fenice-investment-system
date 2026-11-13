/** Phase 4 research quality gate: minimum sample and coverage, never a trading approval. */
export function assessPhase4ResearchEvidence({evaluation,minObservedPerHorizon=20,minVenues=4}={}){
 if(!evaluation||!Array.isArray(evaluation.forward?.outcomes)||!Array.isArray(evaluation.summary?.stats)||!Number.isSafeInteger(minObservedPerHorizon)||minObservedPerHorizon<1||!Number.isSafeInteger(minVenues)||minVenues<1)throw Error("INVALID_PHASE4_EVIDENCE");
 const venues=[...new Set(evaluation.forward.outcomes.map(x=>x.mic))].sort();
 const horizons=evaluation.summary.stats.map(s=>({sessions:s.sessions,observed:s.observed,pending:s.pending,minimum:minObservedPerHorizon,sufficient:s.observed>=minObservedPerHorizon}));
 const sampleReady=venues.length>=minVenues&&horizons.length>0&&horizons.every(x=>x.sufficient);
 return {mode:"PHASE4_RESEARCH_SAMPLE_ASSESSMENT",sampleReady,observedVenues:venues,venueCount:venues.length,minVenues,horizons,limitations:["UNATTESTED_PUBLIC_PRICES","NO_INDEPENDENT_DATA_QUORUM","NO_FEES_OR_FX","NOT_REAL_PAPER_CERTIFICATION"],realPaperCertified:false,liveTradingAllowed:false,ordersGenerated:0};
}
