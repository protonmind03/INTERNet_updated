-- 084: overtime and the 8-hour day (Phase 1.4, November 2026).
--
-- Until now a day's hours ran from the credited start to the time-out,
-- however late that was (up to the 16-hour limit). Now they stop at the
-- scheduled end, unless the supervisor approved overtime for that day,
-- when they stop at the approved end instead.
--
--   attendance.credited_until   where the hours stop: the scheduled end,
--                               set at time-in from the day's plan
--                               (services/dayRules.ts). NULL on a day with
--                               no schedule, and on every log made before
--                               this migration, whose hours are never
--                               worked out again: hours already verified do
--                               not change (services/creditedHours.ts).
--
--   overtime_requests           filed by the trainee before or on the day,
--                               with the signed Overtime Form if they have
--                               it; decided by their supervisor. Approvals
--                               per ISO week (Monday to Sunday, Philippine
--                               time) are limited by the OJT rule
--                               overtime_max_per_week (2; ojt_settings).

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS credited_until TIMESTAMP;

CREATE TABLE IF NOT EXISTS overtime_requests (
  id              SERIAL PRIMARY KEY,
  student_id      VARCHAR(50) NOT NULL,
  work_date       DATE NOT NULL,
  planned_start   TIME NOT NULL,
  planned_end     TIME NOT NULL,
  reason          TEXT NOT NULL CHECK (LENGTH(TRIM(reason)) BETWEEN 5 AND 1000),
  form_path       TEXT,
  form_name       TEXT,
  form_type       TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by      VARCHAR(50),
  decided_at      TIMESTAMPTZ,
  decision_note   TEXT CHECK (decision_note IS NULL OR LENGTH(decision_note) <= 500),
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (planned_end > planned_start)
);

-- One live request a day: a second waits until the first is cancelled or rejected.
CREATE UNIQUE INDEX IF NOT EXISTS overtime_requests_one_a_day
  ON overtime_requests (student_id, work_date) WHERE status IN ('pending', 'approved');
CREATE INDEX IF NOT EXISTS idx_overtime_requests_student ON overtime_requests (student_id, work_date DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_overtime_requests_student') THEN
    ALTER TABLE overtime_requests ADD CONSTRAINT fk_overtime_requests_student
      FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
