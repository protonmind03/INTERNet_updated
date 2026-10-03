-- 014: a reminder email that cannot be sent is retried a few times with a
-- growing delay instead of every minute forever, so it no longer holds up
-- the reminders queued behind it.

ALTER TABLE task_deadline_reminders
  ADD COLUMN IF NOT EXISTS email_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE task_deadline_reminders
  ADD COLUMN IF NOT EXISTS email_next_attempt_at TIMESTAMPTZ;
