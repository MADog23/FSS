-- Migration: v1.5.x -> v1.6.0
-- Introduces the unified notification system:
--   system_announcements  — app-manager broadcasts (changelogs, maintenance)
--   household_notifications — per-household feed (safety alerts + announcements)
--
-- Run with: psql $DATABASE_URL -f src/db/migrations/005_v1_6_0.sql

BEGIN;

-- App-manager broadcast messages visible to all households.
-- Published via the admin API (/admin/announcements) using ADMIN_SECRET.
CREATE TABLE IF NOT EXISTS system_announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('update','maintenance','changelog','info')) DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Optional expiry — hide announcement after this date (NULL = never expires)
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-household notification feed.
-- Populated automatically when:
--   a) a safety alert fires (type = 'safety')
--   b) a system announcement is published (type = announcement type)
CREATE TABLE IF NOT EXISTS household_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  -- Link to the source announcement (NULL for safety alerts)
  announcement_id UUID REFERENCES system_announcements(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('safety','update','maintenance','changelog','info')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- NULL = unread
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_household ON household_notifications(household_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON household_notifications(household_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_published ON system_announcements(published_at DESC);

-- Track onboarding completion per household so we only show the wizard once
ALTER TABLE households ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
