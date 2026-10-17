-- 061: schedules that repeat every week or every two weeks, and the
-- expected end date the server works out from them.
--
-- A schedule is a pattern of one week, or of two weeks taking turns,
-- counted from an anchor Monday (the start of a week 1). The coordinator
-- chooses it for a student (their record's Schedule tab) or for a block.
--
--   students.schedule_weeks    1 or 2. Existing rows: 1.
--   students.schedule_anchor   the Monday a week 1 starts on; NULL for a
--                              one-week pattern. Existing rows: NULL.
--   ojt_schedule.week          which week of the pattern the row is in, 1
--                              or 2. Existing rows: 1. So every schedule
--                              saved before this reads as a one-week
--                              pattern, exactly as it did.
--
--   ojt_pattern_week(anchor, weeks, date)
--                              the week of the pattern a date falls in
--                              (the same rule as services/schedulePattern.ts).
--
--   student_projections        one row per student: the expected end date
--                              (projected_end_date) and how it was worked
--                              out: hours required, verified and left, the
--                              day the walk started, the working days it
--                              counted, the holidays and approved absences
--                              it skipped, whether it is at risk and why,
--                              what caused the last recompute, and when.
--                              Rewritten on a log decision, a schedule or
--                              holiday change, and nightly (services/
--                              projection.ts). Derived data: rebuilt any
--                              time from the rest.
--   student_projection_snapshots
--                              the same date once a day per student, kept,
--                              so how a student's expected end moved can be
--                              seen later. One row per student per day; a
--                              later recompute that day replaces it.
--
-- Additive and safe to run again.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS schedule_weeks  SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS schedule_anchor DATE;

ALTER TABLE ojt_schedule
  ADD COLUMN IF NOT EXISTS week SMALLINT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_schedule_weeks_check') THEN
    ALTER TABLE students ADD CONSTRAINT students_schedule_weeks_check
      CHECK (schedule_weeks IN (1, 2)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_schedule_anchor_monday') THEN
    ALTER TABLE students ADD CONSTRAINT students_schedule_anchor_monday
      CHECK (schedule_anchor IS NULL OR EXTRACT(ISODOW FROM schedule_anchor) = 1) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ojt_schedule_week_check') THEN
    ALTER TABLE ojt_schedule ADD CONSTRAINT ojt_schedule_week_check
      CHECK (week IN (1, 2)) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION ojt_pattern_week(anchor DATE, weeks INTEGER, on_date DATE)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN weeks IS DISTINCT FROM 2 OR anchor IS NULL THEN 1
    ELSE MOD(MOD(((on_date - (EXTRACT(ISODOW FROM on_date)::int - 1))
                  - (anchor - (EXTRACT(ISODOW FROM anchor)::int - 1))) / 7, 2) + 2, 2) + 1
  END
$$;

CREATE TABLE IF NOT EXISTS student_projections (
  student_id          VARCHAR(50) PRIMARY KEY,
  projected_end_date  DATE,
  required_hours      NUMERIC(8, 2) NOT NULL DEFAULT 0,
  verified_hours      NUMERIC(8, 2) NOT NULL DEFAULT 0,
  remaining_hours     NUMERIC(8, 2) NOT NULL DEFAULT 0,
  weekly_hours        NUMERIC(6, 2) NOT NULL DEFAULT 0,
  pattern_weeks       SMALLINT NOT NULL DEFAULT 1,
  walk_start          DATE,
  working_days        INTEGER NOT NULL DEFAULT 0,
  holidays_skipped    TEXT[] NOT NULL DEFAULT '{}',
  absences_skipped    TEXT[] NOT NULL DEFAULT '{}',
  at_risk             BOOLEAN NOT NULL DEFAULT FALSE,
  risk_reason         TEXT,
  cause               VARCHAR(40),
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_projection_snapshots (
  student_id          VARCHAR(50) NOT NULL,
  snapshot_date       DATE NOT NULL,
  projected_end_date  DATE,
  remaining_hours     NUMERIC(8, 2) NOT NULL DEFAULT 0,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, snapshot_date)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_student_projections_student') THEN
    ALTER TABLE student_projections
      ADD CONSTRAINT fk_student_projections_student
      FOREIGN KEY (student_id) REFERENCES students(student_id)
      ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_student_projection_snapshots_student') THEN
    ALTER TABLE student_projection_snapshots
      ADD CONSTRAINT fk_student_projection_snapshots_student
      FOREIGN KEY (student_id) REFERENCES students(student_id)
      ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
