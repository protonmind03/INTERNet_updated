-- 010: absences, announcements, complaint replies, and OJT completion.

-- A student files an absence for a day they will not (or did not) report.
-- The supervisor marks it Excused or Unexcused. One filing per student per day.
CREATE TABLE IF NOT EXISTS absences (
  id           SERIAL PRIMARY KEY,
  student_id   VARCHAR(50) NOT NULL,
  date         DATE NOT NULL,
  reason       TEXT NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'Pending'
                 CHECK (status IN ('Pending', 'Excused', 'Unexcused')),
  review_notes TEXT,
  reviewed_by  VARCHAR(50),
  reviewed_at  TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, date)
);

CREATE INDEX IF NOT EXISTS idx_absences_student ON absences(student_id, date DESC);

-- A message the coordinator sent to every student, every supervisor, or both.
-- Each recipient also gets it as a notification; this row is the record.
CREATE TABLE IF NOT EXISTS announcements (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  audience    VARCHAR(20) NOT NULL
                CHECK (audience IN ('students', 'supervisors', 'everyone')),
  created_by  VARCHAR(50),
  recipients  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- The conversation on a complaint, between whoever filed it and the
-- coordinator handling it.
CREATE TABLE IF NOT EXISTS complaint_messages (
  id            SERIAL PRIMARY KEY,
  complaint_id  INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  author_role   VARCHAR(20) NOT NULL
                  CHECK (author_role IN ('student', 'supervisor', 'coordinator')),
  author_id     VARCHAR(50) NOT NULL,
  author_name   TEXT,
  message       TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complaint_messages_complaint
  ON complaint_messages(complaint_id, created_at);

-- Set the moment a student's verified hours first reach their requirement,
-- and cleared if a later correction takes them back under it.
ALTER TABLE students ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Students who had already reached their hours before this migration.
UPDATE students s
SET completed_at = NOW()
WHERE s.completed_at IS NULL
  AND s.required_hours > 0
  AND (
    SELECT COALESCE(SUM(a.hours), 0) FROM attendance a
    WHERE a.student_id = s.student_id AND a.status = 'Verified'
  ) >= s.required_hours;
