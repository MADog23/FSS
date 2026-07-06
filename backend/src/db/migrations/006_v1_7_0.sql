-- Migration: v1.6.x -> v1.7.0
-- Adds password reset tokens, household disable flag, and admin sessions.
-- Run with: psql $DATABASE_URL -f src/db/migrations/006_v1_7_0.sql

BEGIN;

-- Password reset tokens — single use, time-limited
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);

-- Household disable flag — prevents login for all users in a household
ALTER TABLE households ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE households ADD COLUMN IF NOT EXISTS disabled_reason TEXT;

COMMIT;
