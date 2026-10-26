/**
 * All records and signatures generated here are ephemeral TEST DATA,
 * not a verified owner consent, licensed quote feed or a real PAPER fill.
 */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {phaseBPolicyDigest} from "../lib/trading/paper-v7-phase-b-authorization.mjs";
import {submitV7PhaseBOperationalPaperAttempt as submit}
  from "../lib/trading/paper-v7-phase-b-postgres-writer.mjs";

const read=async name=>JSON.parse(await readFile(new URL("../data/"+name,import.meta.url),"utf8"));
const [policyManifest,ownerRequest]=await Promise.all([
  read("paper-v7-phase-b-preparation.json"),read("paper-v7-phase-b-owner-operating-intent.json")
]);
const policy=policyManifest.proposedRiskLimits;
const makeKey=()=>{
  const {privateKey,publicKey}=generateKeyPairSync("ed25519");
  return {privateKey,
    pem:publicKey.export({type:"spki",format:"pem"}),
    pin:createHash("sha256").update(publicKey.export({type:"spki",format:"der"})).digest("hex"),
  };
};
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const authKey=makeKey(),reviewKey=makeKey(),rogue=makeKey();
const seal=(payload,key)=>({
  payload,signatureBase64:sign(null,Buffer.from(JSON.stringify(payload)),key.privateKey).toString("base64")
});
const sha="a".repeat(40),digest="b".repeat(64),nowIso="2026-10-27T15:30:00.000Z";
const campaignId="fenice-v7-phase-b-operational-integration-test";
const approval={
  version:1,approvalId:campaignId,mode:"PAPER_SIMULATION_ONLY",approved:true,
  baselineSha:sha,baselineDigest:digest,policySha256:phaseBPolicyDigest(policy),
  issuedAt:"2026-10-27T08:00:00.000Z",notBefore:"2026-10-27T15:00:00.000Z",
  expiresAt:"2026-11-27T15:00:00.000Z",
  virtualStartingCapitalEuro:10000,maxOrdersPerDay:1,maxAttempts:20,
  maxNotionalEuro:300,maxCapitalPercentPerProbe:3,
  minCalendarDays:30,minEvidenceDays:25,minPaperFills:10,
  brokerSubmissionAllowed:false,liveTradingAllowed:false,
};
const authEnvelope=seal(approval,authKey);
const expiry="2026-11-20T00:00:00.000Z";
const ent={status:"VERIFIED",usageScope:"NON_DISPLAY_INTERNAL",automatedUseAllowed:true,
  dualControlVerified:true,evidenceRef:"contract://synthetic-review-only",
  evidenceSha256:"c".repeat(64),validUntil:expiry};
const instrument={ticker:"ENEL",exchangeMic:"XMIL",currency:"EUR",
  region:"europe",country:"IT",assetClass:"equity",status:"active",
  paperExecutionAllowed:true};
const q=(provider,price)=>({
  symbol:"ENEL",exchangeMic:"XMIL",currency:"EUR",provider,sourceFamily:provider,
  price,observedAt:"2026-10-27T15:29:52.000Z",realtime:true,
  provenanceVerified:true,exactVenueVerified:true,entitlement:ent,
});
const marketObservations={
  quotes:[q("test-vendor-one",290),q("test-vendor-two",290.02)],
  sessions:[{exchangeMic:"XMIL",source:"test-session-licensor",
    state:"OPEN",authoritative:true,observedAt:"2026-10-27T15:29:54.000Z"}],
  fx:[],
};
const rightsSource=provider=>({
  sourceFamily:provider,provider,exchangeMic:"XMIL",currency:"EUR",
  evidenceRef:ent.evidenceRef,evidenceSha256:ent.evidenceSha256,
  automatedUseAllowed:true,usageScope:"NON_DISPLAY_INTERNAL",validUntil:expiry
});
const operatorRightsRegistry={
  sources:[rightsSource("test-vendor-one"),rightsSource("test-vendor-two")],
  sessions:[{exchangeMic:"XMIL",source:"test-session-licensor",
    marketStateEntitled:true,validUntil:expiry}],fx:[],
};
const review={
  version:1,reviewId:"phase-b-rights-review-2026-10-27",
  scope:"PRIVATE_AUTOMATED_PAPER_SIMULATION",
  rightsEvidenceSha256:hash(operatorRightsRegistry),
  validFrom:"2026-10-27T09:00:00.000Z",validUntil:expiry,
  sourceFamilies:["test-vendor-one","test-vendor-two"],
  venueMics:["XMIL"],fxCurrencies:[],approvedForAutomatedPaper:true,
};
const rightsEnvelope=seal(review,reviewKey);
const base={
  ownerRequest,approvalEnvelope:authEnvelope,
  operatorPublicKeyPem:authKey.pem,operatorSpkiSha256:authKey.pin,
  rightsEnvelope,rightsReviewerPublicKeyPem:reviewKey.pem,
  rightsReviewerSpkiSha256:reviewKey.pin,
  expectedBaselineSha:sha,expectedBaselineDigest:digest,
  policy,instrument,marketObservations,operatorRightsRegistry,
  intent:{id:"phaseb-operational-0001",instrumentKey:"XMIL:ENEL",
    side:"BUY",phase:"V7_PHASE_B",proposedNotionalEuro:300,
    createdAt:"2026-10-27T15:29:45.000Z"},
  nowIso,campaignId,
};

// No storage backend currently installed in Fenice = MUST deny execution.
const missing=await submit(base);
assert.equal(missing.status,"OPERATIONAL_PAPER_DENIED");
assert.equal(missing.reason,"PRIVATE_TRANSACTIONAL_DATABASE_NOT_CONNECTED");
assert.equal(missing.genuineProspectivePaperFillsCreated,0);
assert.equal(missing.liveTradingAllowed,false);

class FakeTransactionDatabase {
  constructor(){
    this.campaign={
      campaign_id:campaignId,baseline_commit:sha,baseline_digest:digest,
      policy_sha256:phaseBPolicyDigest(policy),
      owner_approval_digest:hash(authEnvelope),
      owner_key_pin_sha256:authKey.pin,
      signed_not_before:approval.notBefore,
      signed_expires_at:approval.expiresAt,
      virtual_seed_cents:"1000000",virtual_cash_cents:"1000000",
      attempt_count:0,fill_count:0,ledger_tip_sha256:null,
      stop_permanently:false,broker_submission_allowed:false,
      live_trading_allowed:false,
    };
    this.positions=[];this.attempts=[];this.inTx=false;this.trace=[];
    this.failBeforeCommit=false;
  }
  async connect(){
    return {query:this.query.bind(this),release:()=>{this.released=true}};
  }
  async query(sql,params=[]){
    this.trace.push({sql,params});
    if(sql.startsWith("BEGIN")){if(this.inTx)throw Error("IN_TRANSACTION");this.inTx=true;
      this.snapshot=structuredClone({campaign:this.campaign,positions:this.positions,
        attempts:this.attempts});return {rows:[],rowCount:0};}
    if(sql==="ROLLBACK"){({campaign:this.campaign,positions:this.positions,
      attempts:this.attempts}=this.snapshot);this.inTx=false;return {rows:[],rowCount:0};}
    if(sql==="COMMIT"){if(this.failBeforeCommit)throw Error("INJECTED_COMMIT_FAILURE");
      this.inTx=false;return {rows:[],rowCount:0};}
    if(!this.inTx)throw Error("DB_QUERY_OUTSIDE_TRANSACTION");
    if(sql.includes("FROM fenice_paper_v7.campaigns")&&sql.includes("FOR UPDATE"))
      return {rows:[structuredClone(this.campaign)]};
    if(sql.includes("FROM fenice_paper_v7.attempts"))
      return {rows:structuredClone(this.attempts)};
    if(sql.includes("FROM fenice_paper_v7.positions"))
      return {rows:structuredClone(this.positions)};
    if(sql.startsWith("INSERT INTO fenice_paper_v7.positions")){
      this.positions.push({campaign_id:params[0],instrument_key:params[1],
        quantity:params[2],book_cost_cents:params[3]});return {rows:[],rowCount:1};
    }
    if(sql.startsWith("UPDATE fenice_paper_v7.positions")){
      const p=this.positions.find(q=>q.instrument_key===params[1]);
      p.quantity+=params[2];p.book_cost_cents+=params[3];
      return {rows:[],rowCount:1};
    }
    if(sql.startsWith("INSERT INTO fenice_paper_v7.attempts")){
      if(this.attempts.some(a=>a.decision_at.slice(0,10)===params[4]))
        throw Error("DUPLICATE_DAY");
      this.attempts.push({campaign_id:params[0],attempt_id:params[1],
        seq:params[2],decision_at:params[3],utc_trade_date:params[4],
        instrument_key:params[5],side:params[6],state:params[7],
        virtual_notional_cents:params[8],simulated_cost_cents:params[9],
        fee_cents:params[10],post_cash_cents:params[11],
        policy_sha256:params[14],previous_hash:params[15],event_hash:params[16]});
      return {rows:[],rowCount:1};
    }
    if(sql.startsWith("UPDATE fenice_paper_v7.campaigns")){
      this.campaign.attempt_count++;
      this.campaign.fill_count+=params[1];
      this.campaign.virtual_cash_cents=String(params[2]);
      this.campaign.ledger_tip_sha256=params[3];
      return {rows:[],rowCount:1};
    }
    throw Error("UNKNOWN_FAKE_SQL "+sql);
  }
}
const db=new FakeTransactionDatabase();
const accepted=await submit({...base,db});
assert.equal(accepted.status,"OPERATIONAL_PAPER_SIMULATED_FILL_COMMITTED",
  JSON.stringify(accepted));
assert.equal(accepted.committed,true);
assert.equal(db.attempts.length,1);
assert.equal(db.campaign.attempt_count,1);
assert.equal(db.campaign.fill_count,1);
assert.equal(db.positions.length,1);
assert.equal(accepted.liveTradingAllowed,false);
assert.equal(accepted.canSubmitBrokerOrders,false);
assert(db.trace.some(x=>x.sql==="BEGIN ISOLATION LEVEL SERIALIZABLE"));
assert(db.trace.some(x=>x.sql.includes("FOR UPDATE")));
assert(db.trace.some(x=>x.sql==="COMMIT"));
assert.equal(db.released,true,"PG connection must be released after COMMIT");
const idempotent=await submit({...base,db});
assert.equal(idempotent.status,"OPERATIONAL_PAPER_DENIED");
assert.equal(idempotent.reason,"IDEMPOTENT_ALREADY_RECORDED");
assert.equal(db.attempts.length,1);

// Even if an idempotent duplicate is presented, existing corrupted state
// must be detected BEFORE returning a successful replay/no-op.
const corruptedDb=new FakeTransactionDatabase();
assert.equal((await submit({...base,db:corruptedDb})).committed,true);
corruptedDb.attempts[0].event_hash="f".repeat(64);
const corruptHash=await submit({...base,db:corruptedDb});
assert.equal(corruptHash.reason,"DATABASE_TRANSACTION_ABORTED");
assert.equal(corruptHash.genuineProspectivePaperFillsCreated,0);
assert.equal(corruptedDb.attempts.length,1);
const corruptCashDb=new FakeTransactionDatabase();
assert.equal((await submit({...base,db:corruptCashDb})).committed,true);
corruptCashDb.campaign.virtual_cash_cents="999999";
assert.equal((await submit({...base,db:corruptCashDb})).reason,
  "DATABASE_TRANSACTION_ABORTED");
const corruptPositionDb=new FakeTransactionDatabase();
assert.equal((await submit({...base,db:corruptPositionDb})).committed,true);
corruptPositionDb.positions[0].book_cost_cents=1;
assert.equal((await submit({...base,db:corruptPositionDb})).reason,
  "DATABASE_TRANSACTION_ABORTED");
const corruptFillDb=new FakeTransactionDatabase();
assert.equal((await submit({...base,db:corruptFillDb})).committed,true);
corruptFillDb.campaign.fill_count=0;
assert.equal((await submit({...base,db:corruptFillDb})).reason,
  "DATABASE_TRANSACTION_ABORTED");

const negative=async(label,override,reason)=>{
  const testDb=new FakeTransactionDatabase();
  const t=await submit({...base,...override,db:testDb});
  assert.equal(t.status,"OPERATIONAL_PAPER_DENIED",label+" "+JSON.stringify(t));
  assert.equal(t.reason,reason,label+" "+JSON.stringify(t));
  assert.equal(t.committed,false);
  assert.equal(testDb.attempts.length,0,label);
  assert.equal(testDb.positions.length,0,label);
};
await negative("owner not confirmed",{ownerRequest:{
  ...ownerRequest,ownerHasExplicitlyRequestedOperationalPaper:false}},
  "OWNER_SCOPE_NOT_PAPER_ONLY");
await negative("LIVE authorization forged",{ownerRequest:{
  ...ownerRequest,scope:{...ownerRequest.scope,liveTradingAuthorized:true}}},
  "OWNER_SCOPE_NOT_PAPER_ONLY");
await negative("wrong approval campaign",{campaignId:"fenice-v7-phase-b-another-campaign"},
  "CAMPAIGN_ID_NOT_BOUND_TO_APPROVAL");
await negative("unverified signature pin",{operatorSpkiSha256:rogue.pin},
  "OWNER_SIGNATURE_BASELINE_OR_WINDOW_INVALID");
await negative("missing approval",{approvalEnvelope:null},
  "CAMPAIGN_ID_NOT_BOUND_TO_APPROVAL");
await negative("wrong baseline",{expectedBaselineSha:"f".repeat(40)},
  "OWNER_SIGNATURE_BASELINE_OR_WINDOW_INVALID");
await negative("missing rights review",{rightsEnvelope:null},
  "SIGNED_RIGHTS_EVIDENCE_DIGEST_MISMATCH");
await negative("replaced reviewer key",{rightsReviewerPublicKeyPem:rogue.pem},
  "INDEPENDENT_RIGHTS_REVIEW_NOT_VERIFIED");
await negative("tampered venue rights",{operatorRightsRegistry:{
  ...operatorRightsRegistry,sessions:[]}},
  "SIGNED_RIGHTS_EVIDENCE_DIGEST_MISMATCH");
await negative("market CLOSED",{marketObservations:{
  ...marketObservations,sessions:[{...marketObservations.sessions[0],state:"CLOSED"}]}},
  "MARKET_OPEN_DUAL_QUOTE_FX_NOT_ADMITTED");
await negative("one quote family",{marketObservations:{
  ...marketObservations,quotes:[marketObservations.quotes[0]]}},
  "MARKET_OPEN_DUAL_QUOTE_FX_NOT_ADMITTED");
await negative("no fresh quote",{marketObservations:{
  ...marketObservations,quotes:marketObservations.quotes.map(q=>({
    ...q,observedAt:"2026-10-27T15:20:00.000Z"}))}},
  "MARKET_OPEN_DUAL_QUOTE_FX_NOT_ADMITTED");
await negative("no currency support",{instrument:{...instrument,currency:"GBP"}},
  "INSTRUMENT_OR_INTENT_NOT_PAPER_ONLY");
await negative("bad intent scope",{intent:{...base.intent,phase:"LIVE"}},
  "INSTRUMENT_OR_INTENT_NOT_PAPER_ONLY");
const stopped=new FakeTransactionDatabase();stopped.campaign.stop_permanently=true;
const denyStop=await submit({...base,db:stopped});
assert.equal(denyStop.reason,"DATABASE_TRANSACTION_ABORTED");
assert.equal(stopped.attempts.length,0);
const expired=new FakeTransactionDatabase();expired.campaign.signed_expires_at="2026-10-27T15:29:00.000Z";
assert.equal((await submit({...base,db:expired})).reason,"DATABASE_TRANSACTION_ABORTED");
const fail=new FakeTransactionDatabase();fail.failBeforeCommit=true;
const failed=await submit({...base,db:fail});
assert.equal(failed.reason,"DATABASE_TRANSACTION_ABORTED");
assert.equal(fail.attempts.length,0,"transaction rollback must unwind all writes");
assert.equal(fail.positions.length,0);
assert.equal(fail.campaign.attempt_count,0);
assert.equal(fail.released,true,"PG connection must be released after ROLLBACK");
const invalidReview={
  ...review,approvedForAutomatedPaper:false,
};
await negative("signed rights refusal",{rightsEnvelope:seal(invalidReview,reviewKey)},
  "INDEPENDENT_RIGHTS_REVIEW_NOT_VERIFIED");

assert.equal(ownerRequest.execution.newOperationalPaperOrdersAllowed,false);
assert.equal(policyManifest.authorization.approved,false);
console.log("Phase B transaction engine: signed owner + independent rights review, market quorum, serializable PG mock, idempotency, rollback and no broker PASS");
