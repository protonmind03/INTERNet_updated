CREATE TABLE IF NOT EXISTS password_reset_requests (
  email_hash CHAR(64) PRIMARY KEY,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_ip_limits (
  ip_hash CHAR(64) PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  role VARCHAR(20) NOT NULL
    CHECK (role IN ('student', 'supervisor', 'coordinator')),
  account_id VARCHAR(50) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_active
  ON password_reset_tokens(token_hash, expires_at)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  role VARCHAR(20) NOT NULL
    CHECK (role IN ('student', 'supervisor', 'coordinator')),
  account_id VARCHAR(50) NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_account
  ON web_push_subscriptions(role, account_id);

CREATE TABLE IF NOT EXISTS task_deadline_reminders (
  id BIGSERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL,
  reminder_type VARCHAR(20) NOT NULL
    CHECK (reminder_type IN ('24_hours', 'deadline')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  notification_sent_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, reminder_type)
);

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supervisors
  ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE coordinators
  ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_task_deadline_reminders_pending
  ON task_deadline_reminders(scheduled_at)
  WHERE notification_sent_at IS NULL OR email_sent_at IS NULL;
