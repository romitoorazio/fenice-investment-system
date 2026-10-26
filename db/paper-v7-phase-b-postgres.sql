-- FENICE V7 PAPER PHASE B — transactionally durable JOURNAL SCHEMA (not deployed).
-- NO broker / LIVE or custody of API keys. Requires an isolated, private
-- PostgreSQL database and a limited, reviewed application role.
-- DDL is provided for operator review; no connection is configured by this PR.
BEGIN;

CREATE SCHEMA IF NOT EXISTS fenice_paper_v7;

CREATE TABLE IF NOT EXISTS fenice_paper_v7.campaigns (
  campaign_id TEXT PRIMARY KEY,
  baseline_commit CHAR(40) NOT NULL CHECK (baseline_commit ~ '^[0-9a-f]{40}$'),
  baseline_digest CHAR(64) NOT NULL CHECK (baseline_digest ~ '^[0-9a-f]{64}$'),
  policy_sha256 CHAR(64) NOT NULL CHECK (policy_sha256 ~ '^[0-9a-f]{64}$'),
  owner_approval_digest CHAR(64) NOT NULL CHECK (owner_approval_digest ~ '^[0-9a-f]{64}$'),
  owner_key_pin_sha256 CHAR(64) NOT NULL CHECK (owner_key_pin_sha256 ~ '^[0-9a-f]{64}$'),
  signed_not_before TIMESTAMPTZ NOT NULL,
  signed_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  virtual_seed_cents BIGINT NOT NULL DEFAULT 1000000 CHECK (virtual_seed_cents = 1000000),
  virtual_cash_cents BIGINT NOT NULL DEFAULT 1000000 CHECK (virtual_cash_cents BETWEEN 0 AND 1000000),
  stop_permanently BOOLEAN NOT NULL DEFAULT FALSE,
  stopped_at TIMESTAMPTZ,
  attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 20),
  fill_count SMALLINT NOT NULL DEFAULT 0 CHECK (fill_count BETWEEN 0 AND 20),
  ledger_tip_sha256 CHAR(64),
  broker_submission_allowed BOOLEAN NOT NULL DEFAULT FALSE CHECK (broker_submission_allowed = FALSE),
  live_trading_allowed BOOLEAN NOT NULL DEFAULT FALSE CHECK (live_trading_allowed = FALSE),
  CHECK (signed_not_before < signed_expires_at),
  CHECK (signed_expires_at - signed_not_before >= INTERVAL '30 days'),
  CHECK (stop_permanently OR stopped_at IS NULL),
  CHECK (fill_count <= attempt_count),
  CHECK (attempt_count = 0 OR ledger_tip_sha256 IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS fenice_paper_v7.attempts (
  campaign_id TEXT NOT NULL REFERENCES fenice_paper_v7.campaigns(campaign_id) ON DELETE RESTRICT,
  attempt_id TEXT NOT NULL,
  seq SMALLINT NOT NULL CHECK (seq BETWEEN 1 AND 20),
  decision_at TIMESTAMPTZ NOT NULL,
  utc_trade_date DATE NOT NULL,
  instrument_key TEXT NOT NULL CHECK (instrument_key ~ '^[A-Z0-9]{4}:[A-Z0-9][A-Z0-9._:-]{0,23}$'),
  side TEXT NOT NULL DEFAULT 'BUY' CHECK (side = 'BUY'),
  state TEXT NOT NULL CHECK (state IN ('SIM_FILLED', 'RISK_REJECTED')),
  virtual_notional_cents INTEGER NOT NULL CHECK (virtual_notional_cents BETWEEN 25000 AND 30000),
  simulated_cost_cents INTEGER NOT NULL CHECK (simulated_cost_cents BETWEEN 0 AND 30000),
  fee_cents INTEGER NOT NULL CHECK (fee_cents >= 0),
  post_cash_cents BIGINT NOT NULL CHECK (post_cash_cents BETWEEN 0 AND 1000000),
  source_attestation_sha256 CHAR(64) NOT NULL CHECK (source_attestation_sha256 ~ '^[0-9a-f]{64}$'),
  market_quorum_sha256 CHAR(64) NOT NULL CHECK (market_quorum_sha256 ~ '^[0-9a-f]{64}$'),
  policy_sha256 CHAR(64) NOT NULL CHECK (policy_sha256 ~ '^[0-9a-f]{64}$'),
  previous_hash CHAR(64),
  event_hash CHAR(64) NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, attempt_id),
  UNIQUE (campaign_id, seq),
  UNIQUE (campaign_id, utc_trade_date),
  UNIQUE (campaign_id, event_hash),
  CHECK ((state = 'SIM_FILLED' AND simulated_cost_cents > 0)
      OR (state = 'RISK_REJECTED' AND simulated_cost_cents = 0)),
  CHECK (utc_trade_date = (decision_at AT TIME ZONE 'UTC')::date)
);
CREATE INDEX IF NOT EXISTS paper_phase_b_evidence_day ON fenice_paper_v7.attempts (campaign_id, utc_trade_date);

CREATE TABLE IF NOT EXISTS fenice_paper_v7.positions (
  campaign_id TEXT NOT NULL REFERENCES fenice_paper_v7.campaigns(campaign_id) ON DELETE RESTRICT,
  instrument_key TEXT NOT NULL CHECK (instrument_key ~ '^[A-Z0-9]{4}:[A-Z0-9][A-Z0-9._:-]{0,23}$'),
  quantity BIGINT NOT NULL CHECK (quantity >= 0),
  book_cost_cents BIGINT NOT NULL CHECK (book_cost_cents BETWEEN 0 AND 150000),
  PRIMARY KEY (campaign_id, instrument_key)
);
CREATE OR REPLACE FUNCTION fenice_paper_v7.reject_attempt_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'FENICE_PAPER_V7_ATTEMPT_APPEND_ONLY' USING ERRCODE = '23514';
END
$$;

DROP TRIGGER IF EXISTS attempts_update_or_delete_denied ON fenice_paper_v7.attempts;
CREATE TRIGGER attempts_update_or_delete_denied
BEFORE UPDATE OR DELETE ON fenice_paper_v7.attempts
FOR EACH ROW EXECUTE FUNCTION fenice_paper_v7.reject_attempt_mutation();

CREATE OR REPLACE FUNCTION fenice_paper_v7.reject_campaign_rearm()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.stop_permanently = TRUE AND NEW.stop_permanently <> TRUE THEN
    RAISE EXCEPTION 'FENICE_PAPER_V7_PERMANENT_STOP' USING ERRCODE = '23514';
  END IF;
  IF NEW.baseline_commit <> OLD.baseline_commit
    OR NEW.baseline_digest <> OLD.baseline_digest
    OR NEW.policy_sha256 <> OLD.policy_sha256
    OR NEW.owner_approval_digest <> OLD.owner_approval_digest
    OR NEW.owner_key_pin_sha256 <> OLD.owner_key_pin_sha256
    OR NEW.signed_not_before <> OLD.signed_not_before
    OR NEW.signed_expires_at <> OLD.signed_expires_at
    OR NEW.virtual_seed_cents <> OLD.virtual_seed_cents
    OR NEW.broker_submission_allowed <> OLD.broker_submission_allowed
    OR NEW.live_trading_allowed <> OLD.live_trading_allowed
  THEN
    RAISE EXCEPTION 'FENICE_PAPER_V7_IMMUTABLE_APPROVAL' USING ERRCODE = '23514';
  END IF;
  IF NEW.attempt_count < OLD.attempt_count OR NEW.fill_count < OLD.fill_count
    OR NEW.virtual_cash_cents > OLD.virtual_cash_cents
  THEN
    RAISE EXCEPTION 'FENICE_PAPER_V7_COUNTER_OR_CASH_ROLLBACK' USING ERRCODE = '23514';
  END IF;
  IF NEW.stop_permanently = TRUE AND NEW.stopped_at IS NULL THEN
    RAISE EXCEPTION 'FENICE_PAPER_V7_MISSING_STOP_TIMESTAMP' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS campaigns_rearm_or_approval_mutation_denied ON fenice_paper_v7.campaigns;
CREATE TRIGGER campaigns_rearm_or_approval_mutation_denied
BEFORE UPDATE ON fenice_paper_v7.campaigns
FOR EACH ROW EXECUTE FUNCTION fenice_paper_v7.reject_campaign_rearm();

-- Deployment must restrict write grants to a reviewed dedicated application
-- identity. PUBLIC has no direct table or schema privileges.
REVOKE ALL ON SCHEMA fenice_paper_v7 FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA fenice_paper_v7 FROM PUBLIC;
COMMIT;
