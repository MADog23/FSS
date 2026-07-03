-- Financial Safety Forecasting System
-- PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Households
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','viewer')) DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Accounts
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'checking',
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  warning_threshold NUMERIC(14,2),
  is_spendable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Income events
CREATE TABLE income_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','yearly','once')),
  next_date DATE NOT NULL,
  source_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bill events
CREATE TABLE bill_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','yearly','once')),
  next_date DATE NOT NULL,
  target_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Marks a single occurrence of a recurring bill as already paid,
-- so the forecast engine skips that specific date.
CREATE TABLE bill_payment_marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES bill_events(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bill_id, occurrence_date)
);

-- Credit cards
CREATE TABLE credit_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0,
  cycle_day_of_month INTEGER NOT NULL CHECK (cycle_day_of_month BETWEEN 1 AND 28),
  due_offset_days INTEGER NOT NULL DEFAULT 25,
  payment_rule TEXT NOT NULL CHECK (payment_rule IN ('minimum','statement','fixed')) DEFAULT 'minimum',
  minimum_payment NUMERIC(14,2),
  fixed_amount NUMERIC(14,2),
  payment_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-cycle overrides for a credit card payment (lets the user change a single
-- upcoming payment's amount without altering the card's default rule)
CREATE TABLE credit_card_cycle_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  override_amount NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(credit_card_id, due_date)
);

-- Saved scenarios
CREATE TABLE scenarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scenario overlay events
CREATE TABLE scenario_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('income','expense')),
  event_date DATE NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_accounts_household ON accounts(household_id);
CREATE INDEX idx_income_household ON income_events(household_id);
CREATE INDEX idx_bills_household ON bill_events(household_id);
CREATE INDEX idx_cc_household ON credit_cards(household_id);
CREATE INDEX idx_users_household ON users(household_id);
