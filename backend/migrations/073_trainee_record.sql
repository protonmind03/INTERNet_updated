-- 073: the trainee's own OJT record (revisions, November 2026).
--
-- What the trainee now writes or keeps in the app, towards the PSU
-- "Narrative Report on Internship Training":
--
--   student_feedback_forms   the Student-Intern's Feedback Form (PSU form
--                            FM-AA-INT-20): seven statements rated from
--                            Strongly Agree (5) to Strongly Disagree (1),
--                            the problems met and other concerns. One per
--                            student; kept as a draft until submitted, and
--                            still editable after.
--
--   daily_reports            the day's progress report: one per student per
--                            day, started from what they wrote at time-out
--                            (attendance.accomplishments stays as it was
--                            recorded; the report is the trainee's own words
--                            about the day and may be changed).
--   daily_report_entries     events added to a day as they happen, each with
--                            its own pictures (attachments, owner
--                            'report_entry'). Removing one keeps the row.
--   monthly_reports          the trainee's short summary and highlights for a
--                            month. The rest of a monthly report is put
--                            together from the days, weeks and tasks; no
--                            one reviews it (supervisors review the weekly
--                            report only).
--
--   narrative_reports        the trainee's drafts of the parts of the
--                            narrative report they write themselves, keyed
--                            by part, as JSON: { "<part>": { "text", "updated_at" } }.
--
--   attachments.captured_in_app   TRUE for a picture taken with INTERNet's own
--                                 camera rather than chosen from the phone
--   attachments.taken_at          when it was taken, as the app recorded it
--                                 (the album sorts by this, else created_at)

CREATE TABLE IF NOT EXISTS student_feedback_forms (
  id             SERIAL PRIMARY KEY,
  student_id     VARCHAR(50) NOT NULL UNIQUE,
  ratings        JSONB NOT NULL DEFAULT '{}'::jsonb,
  problems_met   TEXT,
  other_concerns TEXT,
  submitted_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id          SERIAL PRIMARY KEY,
  student_id  VARCHAR(50) NOT NULL,
  report_date DATE NOT NULL,
  summary     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, report_date)
);

CREATE TABLE IF NOT EXISTS daily_report_entries (
  id          SERIAL PRIMARY KEY,
  report_id   INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  student_id  VARCHAR(50) NOT NULL,
  happened_at TIME,
  title       TEXT NOT NULL DEFAULT '',
  details     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_daily_report_entries_report ON daily_report_entries (report_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_daily_reports_student ON daily_reports (student_id, report_date DESC);

CREATE TABLE IF NOT EXISTS monthly_reports (
  id          SERIAL PRIMARY KEY,
  student_id  VARCHAR(50) NOT NULL,
  month_start DATE NOT NULL CHECK (EXTRACT(DAY FROM month_start) = 1),
  summary     TEXT,
  highlights  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, month_start)
);

CREATE TABLE IF NOT EXISTS narrative_reports (
  id         SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL UNIQUE,
  parts      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pictures may now belong to a day's event.
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_owner_type_check;
ALTER TABLE attachments
  ADD CONSTRAINT attachments_owner_type_check
  CHECK (owner_type IN ('attendance', 'journal', 'complaint', 'report_entry'));

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS captured_in_app BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ;

-- Each row belongs to a student; renaming a student id carries over (as attachments do).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['student_feedback_forms', 'daily_reports', 'daily_report_entries', 'monthly_reports', 'narrative_reports'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_' || t || '_student') THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (student_id) REFERENCES students(student_id) ON UPDATE CASCADE ON DELETE CASCADE',
        t, 'fk_' || t || '_student'
      );
    END IF;
  END LOOP;
END $$;
