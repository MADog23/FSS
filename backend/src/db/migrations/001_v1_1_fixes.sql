-- Migration: v1.0 -> v1.1
-- Additive only — safe to run against an existing database.
-- Run with: psql $DATABASE_URL -f src/db/migrations/001_v1_1_fixes.sql

BEGIN;

-- Fix: free cash counting savings as spendable
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_spendable BOOLEAN NOT NULL DEFAULT TRUE;

-- Improvement: explicit minimum payment input on credit cards
ALTER TABLE credit_cards
  ADD COLUMN IF NOT EXISTS minimum_payment NUMERIC(14,2);

-- Improvement: per-cycle payment override on credit cards
CREATE TABLE IF NOT EXISTS credit_card_cycle_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  override_amount NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(credit_card_id, due_date)
);

-- Improvement: mark a single bill occurrence as already paid
CREATE TABLE IF NOT EXISTS bill_payment_marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES bill_events(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bill_id, occurrence_date)
);

COMMIT;
