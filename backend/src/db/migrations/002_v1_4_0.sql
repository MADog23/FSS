-- Migration: v1.3 -> v1.4.0
-- Additive only — safe to run against an existing database.
-- Run with: psql $DATABASE_URL -f src/db/migrations/002_v1_4_0.sql

BEGIN;

-- Per-occurrence amount override for fluctuating income (hourly/tipped workers).
-- Lets a user tap a specific paycheck in the timeline and set the actual
-- expected amount for that date without changing the recurring default.
CREATE TABLE IF NOT EXISTS income_event_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  income_event_id UUID NOT NULL REFERENCES income_events(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  override_amount NUMERIC(14,2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(income_event_id, occurrence_date)
);

-- Balance update log — records every quick-update so there's an audit trail
-- of when a user last synced their real bank balance.
CREATE TABLE IF NOT EXISTS account_balance_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  previous_balance NUMERIC(14,2) NOT NULL,
  new_balance NUMERIC(14,2) NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Email alert preferences per household
CREATE TABLE IF NOT EXISTS alert_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE UNIQUE,
  alert_email TEXT,
  alert_on_danger BOOLEAN NOT NULL DEFAULT TRUE,
  alert_on_warning BOOLEAN NOT NULL DEFAULT FALSE,
  last_alerted_at TIMESTAMPTZ,
  last_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
