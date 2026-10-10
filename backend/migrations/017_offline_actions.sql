-- 017: break, back-to-work and time-out recorded while the phone was offline.
--
-- A student whose connection drops during the day can still press Break,
-- Back to work or Time out. The app keeps the action with the time it was
-- pressed and sends it when the connection returns. Two things make that
-- safe to accept:
--
-- * attendance.recorded_offline marks a log that has at least one step
--   whose time came from the phone, not from this server, so the
--   supervisor can see it when reviewing.
-- * offline_action_ledger remembers each such action by the id the app gave
--   it. The same action arriving twice (the app retries until it hears
--   back) is answered from here and changes nothing the second time.
--
-- Additive only. Requests that send neither field behave as before.

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS recorded_offline BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS offline_action_ledger (
  client_request_id TEXT PRIMARY KEY,
  student_id        VARCHAR(50) NOT NULL,
  attendance_id     INTEGER NOT NULL,
  action            TEXT NOT NULL CHECK (action IN ('break', 'break-end', 'time-out')),
  occurred_at       TIMESTAMPTZ NOT NULL,
  -- The attendance row as it was returned the first time.
  response          JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offline_action_ledger_attendance
  ON offline_action_ledger (attendance_id);

-- New foreign keys are added NOT VALID: enforced for new rows without
-- re-checking (and locking against) rows that already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_offline_action_ledger_attendance'
  ) THEN
    ALTER TABLE offline_action_ledger
      ADD CONSTRAINT fk_offline_action_ledger_attendance
      FOREIGN KEY (attendance_id) REFERENCES attendance(id)
      ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
