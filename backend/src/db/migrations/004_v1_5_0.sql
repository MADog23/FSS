-- Migration: v1.4.x -> v1.5.0
-- Introduces event_completions: a single unified table that records when any
-- timeline event (income, bill, cc_payment) has been marked complete, and
-- optionally what the actual amount was (if different from the projected amount).
--
-- This replaces the three separate override mechanisms:
--   bill_payment_marks     (bills marked as paid)
--   income_event_overrides (fluctuating paycheck amounts)
--   credit_card_cycle_overrides (per-cycle payment overrides)
--
-- The old tables are left in place for data safety — they are simply no
-- longer read by the forecast engine in v1.5.0+.
--
-- Run with: psql $DATABASE_URL -f src/db/migrations/004_v1_5_0.sql

BEGIN;

CREATE TABLE IF NOT EXISTS event_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,

  -- Which recurring event this completion belongs to.
  -- Exactly one of these will be set depending on event type.
  income_event_id  UUID REFERENCES income_events(id)  ON DELETE CASCADE,
  bill_event_id    UUID REFERENCES bill_events(id)     ON DELETE CASCADE,
  credit_card_id   UUID REFERENCES credit_cards(id)    ON DELETE CASCADE,

  -- The specific date of the occurrence being completed
  -- (e.g. the July 1 occurrence of a monthly rent bill).
  occurrence_date DATE NOT NULL,

  -- The actual amount that was paid/received.
  -- NULL means "use the projected amount" — only populated when the user
  -- edits the value to differ from the projection.
  actual_amount NUMERIC(14,2),

  -- Who completed it and when
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate completions for the same event occurrence
  CONSTRAINT event_completions_income_unique  UNIQUE (income_event_id,  occurrence_date),
  CONSTRAINT event_completions_bill_unique    UNIQUE (bill_event_id,    occurrence_date),
  CONSTRAINT event_completions_cc_unique      UNIQUE (credit_card_id,   occurrence_date),

  -- Ensure exactly one source FK is set
  CONSTRAINT event_completions_one_source CHECK (
    (income_event_id IS NOT NULL)::int +
    (bill_event_id   IS NOT NULL)::int +
    (credit_card_id  IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_completions_household ON event_completions(household_id);
CREATE INDEX IF NOT EXISTS idx_completions_income    ON event_completions(income_event_id);
CREATE INDEX IF NOT EXISTS idx_completions_bill      ON event_completions(bill_event_id);
CREATE INDEX IF NOT EXISTS idx_completions_cc        ON event_completions(credit_card_id);

COMMIT;
