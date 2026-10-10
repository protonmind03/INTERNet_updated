-- 021: terms, so one batch of interns can be told from the next.
--
-- A term is a named stretch of dates ("2nd Semester 2026-2027"). Each
-- student belongs to at most one. When a term is over the coordinator
-- closes it: its students are deactivated together and it drops out of the
-- everyday lists, but nothing is deleted. Their attendance, tasks and
-- documents stay exactly where they were and can still be opened.
--
-- * closed_student_ids remembers which students the closing deactivated, so
--   reopening a term closed by mistake reactivates those and no others.
-- * A student created while a term is running joins it automatically (the
--   trigger below); any other student has no term until one is chosen.
--
-- Additive only. The new foreign key is NOT VALID.

CREATE TABLE IF NOT EXISTS terms (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL CHECK (LENGTH(TRIM(name)) BETWEEN 2 AND 80),
  start_date         DATE NOT NULL,
  end_date           DATE NOT NULL,
  is_closed          BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at          TIMESTAMPTZ,
  closed_student_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS terms_name_key ON terms (LOWER(TRIM(name)));

ALTER TABLE students ADD COLUMN IF NOT EXISTS term_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_students_term_id ON students (term_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_students_term') THEN
    ALTER TABLE students
      ADD CONSTRAINT fk_students_term
      FOREIGN KEY (term_id) REFERENCES terms(id)
      ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- A new student joins the term that is running on the day they are created.
CREATE OR REPLACE FUNCTION assign_current_term() RETURNS trigger AS $$
BEGIN
  IF NEW.term_id IS NULL THEN
    NEW.term_id := (
      SELECT id FROM terms
      WHERE is_closed = FALSE AND CURRENT_DATE BETWEEN start_date AND end_date
      ORDER BY start_date DESC, id DESC
      LIMIT 1
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_students_assign_term ON students;
CREATE TRIGGER trg_students_assign_term
  BEFORE INSERT ON students
  FOR EACH ROW EXECUTE FUNCTION assign_current_term();
