-- All rows and hashes here are synthetic CI fixtures.
-- Run only on an EPHEMERAL PostgreSQL database, NEVER production.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO fenice_paper_v7.campaigns(
  campaign_id,baseline_commit,baseline_digest,policy_sha256,
  owner_approval_digest,owner_key_pin_sha256,
  signed_not_before,signed_expires_at
) VALUES (
  'fenice-v7-phase-b-sql-fixture',
  repeat('a',40),repeat('b',64),repeat('c',64),
  repeat('d',64),repeat('e',64),
  '2026-10-27T00:00:00Z','2026-11-27T00:00:00Z'
);

INSERT INTO fenice_paper_v7.attempts(
  campaign_id,attempt_id,seq,decision_at,utc_trade_date,
  instrument_key,state,virtual_notional_cents,simulated_cost_cents,
  fee_cents,post_cash_cents,source_attestation_sha256,market_quorum_sha256,
  policy_sha256,event_hash
) VALUES (
  'fenice-v7-phase-b-sql-fixture','paper-ci-attempt-0001',1,
  '2026-10-27T14:00:00Z','2026-10-27','XMIL:ENEL','RISK_REJECTED',
  25000,0,0,1000000,repeat('1',64),repeat('2',64),repeat('c',64),repeat('3',64)
);

UPDATE fenice_paper_v7.campaigns
  SET attempt_count=1,ledger_tip_sha256=repeat('3',64)
  WHERE campaign_id='fenice-v7-phase-b-sql-fixture';
INSERT INTO fenice_paper_v7.positions(campaign_id,instrument_key,quantity,book_cost_cents)
VALUES ('fenice-v7-phase-b-sql-fixture','XMIL:ENEL',1,10000);
DO $$
DECLARE v integer;
BEGIN
  SELECT COUNT(*) INTO v FROM fenice_paper_v7.attempts;
  IF v <> 1 THEN RAISE EXCEPTION 'EXPECTED_ONE_TEST_ATTEMPT'; END IF;
  BEGIN
    INSERT INTO fenice_paper_v7.attempts(
      campaign_id,attempt_id,seq,decision_at,utc_trade_date,
      instrument_key,state,virtual_notional_cents,simulated_cost_cents,
      fee_cents,post_cash_cents,source_attestation_sha256,market_quorum_sha256,
      policy_sha256,event_hash
    ) VALUES(
      'fenice-v7-phase-b-sql-fixture','paper-ci-attempt-0002',2,
      '2026-10-27T14:05:00Z','2026-10-27','XMIL:ENEL','RISK_REJECTED',
      25000,0,0,1000000,repeat('1',64),repeat('2',64),repeat('c',64),repeat('4',64)
    );
    RAISE EXCEPTION 'DUPLICATE_DATE_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS one attempt per UTC date';
  END;
  BEGIN
    UPDATE fenice_paper_v7.attempts SET state='SIM_FILLED'
      WHERE attempt_id='paper-ci-attempt-0001';
    RAISE EXCEPTION 'MUTABLE_ATTEMPT_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS attempts append-only on UPDATE';
  END;
  BEGIN
    DELETE FROM fenice_paper_v7.attempts
      WHERE attempt_id='paper-ci-attempt-0001';
    RAISE EXCEPTION 'DELETABLE_ATTEMPT_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS attempts append-only on DELETE';
  END;
  BEGIN
    UPDATE fenice_paper_v7.campaigns SET baseline_commit=repeat('f',40)
      WHERE campaign_id='fenice-v7-phase-b-sql-fixture';
    RAISE EXCEPTION 'MUTABLE_BASELINE_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS approval immutable';
  END;
  BEGIN
    UPDATE fenice_paper_v7.campaigns SET attempt_count=0
      WHERE campaign_id='fenice-v7-phase-b-sql-fixture';
    RAISE EXCEPTION 'COUNTER_ROLLBACK_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS attempt counter monotonic';
  END;
  BEGIN
    INSERT INTO fenice_paper_v7.positions(campaign_id,instrument_key,quantity,book_cost_cents)
    VALUES('fenice-v7-phase-b-sql-fixture','XMIL:OTHER',1,150001);
    RAISE EXCEPTION 'CONCENTRATION_CAP_BYPASSED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS per instrument virtual concentration cap';
  END;
  BEGIN
    INSERT INTO fenice_paper_v7.campaigns(
      campaign_id,baseline_commit,baseline_digest,policy_sha256,
      owner_approval_digest,owner_key_pin_sha256,
      signed_not_before,signed_expires_at,live_trading_allowed
    ) VALUES(
      'fenice-v7-phase-b-live-illegal',
      repeat('a',40),repeat('b',64),repeat('c',64),
      repeat('d',64),repeat('e',64),
      '2026-10-27T00:00:00Z','2026-11-27T00:00:00Z',true
    );
    RAISE EXCEPTION 'LIVE_FLAG_BYPASSED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS LIVE explicitly forbidden by database';
  END;
  BEGIN
    INSERT INTO fenice_paper_v7.campaigns(
      campaign_id,baseline_commit,baseline_digest,policy_sha256,
      owner_approval_digest,owner_key_pin_sha256,
      signed_not_before,signed_expires_at
    ) VALUES(
      'fenice-v7-phase-b-short-window',
      repeat('a',40),repeat('b',64),repeat('c',64),
      repeat('d',64),repeat('e',64),
      '2026-10-27T00:00:00Z','2026-11-01T00:00:00Z'
    );
    RAISE EXCEPTION 'TOO_SHORT_APPROVAL_ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS minimum 30 days approved window';
  END;
END
$$;
UPDATE fenice_paper_v7.campaigns
  SET stop_permanently=TRUE,stopped_at='2026-10-27T20:00:00Z'
  WHERE campaign_id='fenice-v7-phase-b-sql-fixture';
DO $$
BEGIN
  BEGIN
    UPDATE fenice_paper_v7.campaigns SET stop_permanently=FALSE
      WHERE campaign_id='fenice-v7-phase-b-sql-fixture';
    RAISE EXCEPTION 'KILL_SWITCH_REVERSIBLE';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS permanent stop cannot be rearmed';
  END;
  IF NOT EXISTS (
    SELECT 1 FROM fenice_paper_v7.campaigns
    WHERE campaign_id='fenice-v7-phase-b-sql-fixture'
      AND stop_permanently=TRUE
      AND attempt_count=1 AND fill_count=0
      AND virtual_cash_cents=1000000
      AND broker_submission_allowed=FALSE
      AND live_trading_allowed=FALSE
  ) THEN
    RAISE EXCEPTION 'FINAL_SQL_STATE_INCONSISTENT';
  END IF;
END
$$;
ROLLBACK;
