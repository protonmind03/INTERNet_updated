-- 026: the weekly journal.
--
-- One entry per student per week, kept under the Monday the week starts
-- on. The student writes it, their supervisor marks it reviewed or returns
-- it with a note, and the coordinator can read it on the student's record.
--
-- status: Submitted (waiting for the supervisor), Reviewed, or Returned
-- (the supervisor asked for changes; the student may edit and resubmit).

CREATE TABLE IF NOT EXISTS journals (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  week_start DATE NOT NULL,
  activities TEXT NOT NULL,
  learnings TEXT NOT NULL,
  challenges TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Submitted',
  review_notes TEXT,
  reviewed_by_supervisor_id VARCHAR(50),
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_journals_student_week
  ON journals (student_id, week_start);
