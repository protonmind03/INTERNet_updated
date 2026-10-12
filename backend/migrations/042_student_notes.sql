-- 042: notes about a student, between their supervisor and the coordinator.
--
-- A thread per student that the supervisor and the coordinators write in
-- and read. It is for the two of them: "she has been late three times",
-- "I will call the company". The student is never shown it, and it is not
-- part of the copy of their data they can download: it is the staff's own
-- working record about the placement, not something the student wrote or
-- did.
--
-- A message is never edited or deleted, so the thread stays a record of
-- what was said. author_name is kept with each message, so it still says
-- who wrote it after an account is renamed or deactivated.
--
-- Additive only. The foreign key is NOT VALID.

CREATE TABLE IF NOT EXISTS student_notes (
  id          SERIAL PRIMARY KEY,
  student_id  VARCHAR(50) NOT NULL,
  author_role VARCHAR(20) NOT NULL CHECK (author_role IN ('supervisor', 'coordinator')),
  author_id   VARCHAR(50) NOT NULL,
  author_name TEXT NOT NULL,
  message     TEXT NOT NULL CHECK (LENGTH(TRIM(message)) BETWEEN 1 AND 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_notes_student ON student_notes (student_id, created_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_student_notes_student') THEN
    ALTER TABLE student_notes
      ADD CONSTRAINT fk_student_notes_student
      FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
