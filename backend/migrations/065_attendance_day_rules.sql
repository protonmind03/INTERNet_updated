-- 065: when a trainee may time in, when hours start to count, what is
-- late, and when a day becomes afternoon-only.
--
-- The rules themselves are in backend/src/services/dayRules.ts, which every
-- attendance route uses. This adds what they read and what they write.
--
--   ojt_schedule.lunch_start, lunch_end
--                       the lunch window of a scheduled day. Existing rows
--                       get NULL: when the shift spans noon, the defaults
--                       below apply (12:00 to 13:00); when it does not, the
--                       day has no lunch.
--
--   attendance.session  'full', 'am' (a morning-only shift) or 'pm' (an
--                       afternoon-only day: a shift that starts at noon or
--                       later, or a day with no time-in by the lunch start).
--                       Existing rows keep NULL, which means a full day, as
--                       before.
--   attendance.credited_from
--                       when the day's hours start to count: the time-in, or
--                       the scheduled start when the trainee came in early.
--                       Existing rows keep NULL, which means hours count
--                       from the time-in, as before. No existing log's hours
--                       are worked out again.
--   attendance.late_minutes
--                       minutes after the scheduled start (plus the grace
--                       below), seconds ignored: 0 is on time; NULL is a day
--                       with no schedule (a holiday or an unscheduled day).
--   attendance.scheduled_start
--                       the start the time-in was measured against (the
--                       lunch end on an afternoon-only day).
--   attendance.lunch_late_minutes
--                       minutes the trainee came back after the lunch end.
--                       Shown only; the hours already leave lunch out.
--
--   attendance_rules    the numbers the rules use, one row each, which the
--                       coordinator may change later. The server reads them
--                       at most once a minute.
--                         early_window_min      how early a time-in opens (30)
--                         late_grace_min        minutes allowed before late (0)
--                         late_ignores_seconds  08:00:59 is still 08:00 (true)
--                         default_lunch_start   12:00
--                         default_lunch_end     13:00
--
-- Additive and safe to run again.

ALTER TABLE ojt_schedule
  ADD COLUMN IF NOT EXISTS lunch_start TIME,
  ADD COLUMN IF NOT EXISTS lunch_end   TIME;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS session            VARCHAR(4),
  ADD COLUMN IF NOT EXISTS credited_from      TIMESTAMP,
  ADD COLUMN IF NOT EXISTS late_minutes       INTEGER,
  ADD COLUMN IF NOT EXISTS scheduled_start    TIME,
  ADD COLUMN IF NOT EXISTS lunch_late_minutes INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_session_check') THEN
    ALTER TABLE attendance ADD CONSTRAINT attendance_session_check
      CHECK (session IS NULL OR session IN ('full', 'am', 'pm')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ojt_schedule_lunch_check') THEN
    ALTER TABLE ojt_schedule ADD CONSTRAINT ojt_schedule_lunch_check
      CHECK ((lunch_start IS NULL) = (lunch_end IS NULL) AND (lunch_start IS NULL OR lunch_start < lunch_end)) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS attendance_rules (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_by VARCHAR(50),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO attendance_rules (key, value) VALUES
  ('early_window_min', '30'),
  ('late_grace_min', '0'),
  ('late_ignores_seconds', 'true'),
  ('default_lunch_start', '12:00'),
  ('default_lunch_end', '13:00')
ON CONFLICT (key) DO NOTHING;
