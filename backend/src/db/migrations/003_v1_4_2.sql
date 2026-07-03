-- Migration: v1.4.1 -> v1.4.2
-- Adds quarterly and yearly frequency options to both bill_events and income_events.
-- Run with: psql $DATABASE_URL -f src/db/migrations/003_v1_4_2.sql

BEGIN;

-- Bills
ALTER TABLE bill_events
  DROP CONSTRAINT IF EXISTS bill_events_frequency_check;

ALTER TABLE bill_events
  ADD CONSTRAINT bill_events_frequency_check
  CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','yearly','once'));

-- Income
ALTER TABLE income_events
  DROP CONSTRAINT IF EXISTS income_events_frequency_check;

ALTER TABLE income_events
  ADD CONSTRAINT income_events_frequency_check
  CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','yearly','once'));

COMMIT;
