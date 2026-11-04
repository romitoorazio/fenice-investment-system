import assert from "node:assert/strict";
import { resolveBrokerVenueIdentity } from "../lib/trading/global-broker-venue-identity.ts";

const now = Date.parse("2026-09-28T10:00:00.000Z");
const verifiedRecord = {
  broker: "directa",
  brokerTicker: "ENEL",
  isin: "IT0003128367",
  exchangeMic: "XMIL",
  currency: "EUR",
  status: "VERIFIED",
  evidenceRef: "fixture:directa-enel-xmil",
  evidenceSha256: "b".repeat(64),
  reviewedAt: "2026-09-27T10:00:00.000Z",
  validUntil: "2026-10-28T10:00:00.000Z",
};
const registry = {
  version: 1,
  policy: "DEFAULT_DENY_BROKER_VENUE_IDENTITY",
  identities: [verifiedRecord],
};

const good = resolveBrokerVenueIdentity(registry, "directa", "ENEL", "IT0003128367", now);
assert.equal(good.exactVenueVerified, true);
assert.equal(good.exchangeMic, "XMIL");
assert.equal(good.currency, "EUR");
assert.equal(good.evidenceSha256, "b".repeat(64));

const wrongIsin = resolveBrokerVenueIdentity(registry, "directa", "ENEL", "IT0000000000", now);
assert.equal(wrongIsin.exactVenueVerified, false);
assert.equal(wrongIsin.exchangeMic, "");

const wrongTicker = resolveBrokerVenueIdentity(registry, "directa", "ENELX", "IT0003128367", now);
assert.equal(wrongTicker.exactVenueVerified, false);

const wrongBroker = resolveBrokerVenueIdentity(registry, "other", "ENEL", "IT0003128367", now);
assert.equal(wrongBroker.exactVenueVerified, false);

const invalidIsin = resolveBrokerVenueIdentity(registry, "directa", "ENEL", "BAD", now);
assert.equal(invalidIsin.exactVenueVerified, false);
assert.ok(invalidIsin.reasons.some((r) => r.includes("ISIN")));

const expired = resolveBrokerVenueIdentity({
  ...registry,
  identities: [{ ...verifiedRecord, validUntil: "2026-09-28T09:59:59.000Z" }],
}, "directa", "ENEL", "IT0003128367", now);
assert.equal(expired.exactVenueVerified, false);
assert.ok(expired.reasons.some((r) => r.includes("expired")));

const pending = resolveBrokerVenueIdentity({
  ...registry,
  identities: [{ ...verifiedRecord, status: "PENDING" }],
}, "directa", "ENEL", "IT0003128367", now);
assert.equal(pending.exactVenueVerified, false);

const noHash = resolveBrokerVenueIdentity({
  ...registry,
  identities: [{ ...verifiedRecord, evidenceSha256: "" }],
}, "directa", "ENEL", "IT0003128367", now);
assert.equal(noHash.exactVenueVerified, false);

const empty = resolveBrokerVenueIdentity({ policy: "DEFAULT_DENY_BROKER_VENUE_IDENTITY", identities: [] }, "directa", "ENEL", "IT0003128367", now);
assert.equal(empty.exactVenueVerified, false);

console.log("Fenice global broker venue identity tests: PASS");
