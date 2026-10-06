import { isFeniceScore, type FeniceAIAction, type FeniceAIThesis } from "./ai-intelligence-core.ts";
export interface FeniceThesisSnapshot extends FeniceAIThesis { id:string; evidenceIds:string[]; modelVersion:string; promptVersion:string; marketPrice?:number; }
export interface FeniceThesisChange { symbol:string; previousId:string; currentId:string; actionChanged:boolean; previousAction:FeniceAIAction; currentAction:FeniceAIAction; confidenceDelta:number; fsiDelta:number; addedCatalysts:string[]; removedCatalysts:string[]; addedInvalidations:string[]; removedInvalidations:string[]; }
export interface FeniceThesisOutcome { thesisId:string; evaluatedAt:string; horizonReached:boolean; referencePrice?:number; observedPrice?:number; returnPct?:number; thesisInvalidated:boolean; invalidationReason?:string; }
function difference(current:string[],previous:string[]):string[]{const prior=new Set(previous);return current.filter(item=>!prior.has(item));}
export function compareFeniceTheses(previous:FeniceThesisSnapshot,current:FeniceThesisSnapshot):FeniceThesisChange{
 if(validateThesisSnapshot(previous).length || validateThesisSnapshot(current).length) throw new Error("FENICE_AI_THESIS_INVALID_SNAPSHOT");
 if(previous.symbol!==current.symbol) throw new Error("FENICE_AI_THESIS_SYMBOL_MISMATCH");
 if(previous.id===current.id || Date.parse(current.generatedAt)<Date.parse(previous.generatedAt)) throw new Error("FENICE_AI_THESIS_INVALID_REVISION");
 return {symbol:current.symbol,previousId:previous.id,currentId:current.id,actionChanged:previous.action!==current.action,previousAction:previous.action,currentAction:current.action,confidenceDelta:current.confidence-previous.confidence,fsiDelta:current.fsiScore-previous.fsiScore,addedCatalysts:difference(current.catalysts,previous.catalysts),removedCatalysts:difference(previous.catalysts,current.catalysts),addedInvalidations:difference(current.invalidation,previous.invalidation),removedInvalidations:difference(previous.invalidation,current.invalidation)};
}
export function validateThesisSnapshot(snapshot:FeniceThesisSnapshot):string[]{
 const errors:string[]=[];
 for(const [field,code] of [["id","MISSING_THESIS_ID"],["symbol","MISSING_SYMBOL"],["modelVersion","MISSING_MODEL_VERSION"],["promptVersion","MISSING_PROMPT_VERSION"]] as const){
  if(typeof snapshot?.[field]!=="string" || !snapshot[field].trim())errors.push(code);
 }
 if(!Array.isArray(snapshot?.evidenceIds) || !snapshot.evidenceIds.length
  || snapshot.evidenceIds.some(id=>typeof id!=="string" || !id.trim())
  || new Set(snapshot.evidenceIds.map(id=>id.trim())).size!==snapshot.evidenceIds.length)errors.push("MISSING_OR_DUPLICATE_EVIDENCE");
 if(typeof snapshot?.generatedAt!=="string" || !Number.isFinite(Date.parse(snapshot.generatedAt)))errors.push("INVALID_GENERATED_AT");
 if(!isFeniceScore(snapshot?.confidence) || !isFeniceScore(snapshot?.fsiScore))errors.push("INVALID_THESIS_SCORE");
 if(!["BUY","ACCUMULATE","HOLD","WAIT","REDUCE","EXIT"].includes(snapshot?.action))errors.push("INVALID_THESIS_ACTION");
 for(const field of ["rationale","catalysts","invalidation"] as const){
  if(!Array.isArray(snapshot?.[field]) || snapshot[field].some(item=>typeof item!=="string" || !item.trim())
   || (field!=="catalysts" && !snapshot[field].length))errors.push(`INVALID_${field.toUpperCase()}`);
 }
 return errors;
}
