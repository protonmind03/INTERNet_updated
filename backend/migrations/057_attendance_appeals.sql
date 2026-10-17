-- 057: a student appeals a correction or a rejection to the coordinator.
--
-- Within seven days of a time correction, a photo rejection or a rejection
-- of the day, the student may ask the OJT coordinator to look at it. The
-- coordinator upholds the decision or overturns it, with a note the student
-- sees. Filing, withdrawing and deciding are all in the audit log.
--
--   id, attendance_id, student_id
--   kind           'time_correction', 'time_in_rejection' or
--                  'attendance_rejection'
--   reason         the student's words
--   status         'open', 'upheld', 'overturned' or 'withdrawn'
--   thread_id      the conversation about it, once messages exist
--                  (Iteration 6); NULL until then
--   decided_by, decision_note, decided_at
--   created_at, withdrawn_at
--
-- One open appeal per log at a time (a partial unique index).
--
-- Existing rows: none; the table is new.
--
-- Additive and safe to run again. The foreign keys are NOT VALID.

CREATE TABLE IF NOT EXISTS attendance_appeals (
  id             SERIAL PRIMARY KEY,
  attendance_id  INTEGER NOT NULL,
  student_id     VARCHAR(50) NOT NULL,
  kind           VARCHAR(30) NOT NULL
                   CHECK (kind IN ('time_correction', 'time_in_rejection', 'attendance_rejection')),
  reason         TEXT NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'upheld', 'overturned', 'withdrawn')),
  thread_id      INTEGER,
  decided_by     VARCHAR(50),
  decision_note  TEXT,
  decided_at     TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  withdrawn_at   TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_appeals_open
  ON attendance_appeals (attendance_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_attendance_appeals_status
  ON attendance_appeals (status, created_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_attendance_appeals_log') THEN
    ALTER TABLE attendance_appeals
      ADD CONSTRAINT fk_attendance_appeals_log
      FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_attendance_appeals_student') THEN
    ALTER TABLE attendance_appeals
      ADD CONSTRAINT fk_attendance_appeals_student
      FOREIGN KEY (student_id) REFERENCES students(student_id)
      ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
