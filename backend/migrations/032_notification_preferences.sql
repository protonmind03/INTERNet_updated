-- 032: what each person wants to be told outside the app.
--
-- One row per account per category, only for choices that differ from the
-- default (push on, email on). A notification is always kept in the app;
-- these two switches decide only whether it is also pushed to the person's
-- devices, and whether emails of that category are sent to them.

CREATE TABLE IF NOT EXISTS notification_preferences (
  id SERIAL PRIMARY KEY,
  role VARCHAR(20) NOT NULL,
  account_id VARCHAR(50) NOT NULL,
  category VARCHAR(30) NOT NULL,
  push BOOLEAN NOT NULL DEFAULT TRUE,
  email BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_preferences
  ON notification_preferences (role, account_id, category);
