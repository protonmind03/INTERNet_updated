-- 090: semesters, and programs whose OJT spans two terms (Phase 2.6, November 2026).
--
--   terms.semester        first | second | midyear (optional)
--   terms.academic_year   "2026-2027" (optional)
--   program_terms         the semester(s) a program's OJT runs in, in order:
--                         part 1, and part 2 when it continues into a second
--                         term. No rows: the program has not said.
--
-- Hours carry over without any copying: a student's hours are the sum of
-- their verified logs, whatever the term. Carrying over moves the student
-- into the next term before the first one is closed (closing a term
-- deactivates the students still in it).

ALTER TABLE terms ADD COLUMN IF NOT EXISTS semester TEXT;
ALTER TABLE terms ADD COLUMN IF NOT EXISTS academic_year TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'terms_semester_check') THEN
    ALTER TABLE terms ADD CONSTRAINT terms_semester_check CHECK (semester IS NULL OR semester IN ('first', 'second', 'midyear'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'terms_academic_year_check') THEN
    ALTER TABLE terms ADD CONSTRAINT terms_academic_year_check CHECK (
      academic_year IS NULL
      OR (academic_year ~ '^\d{4}-\d{4}$' AND SPLIT_PART(academic_year, '-', 2)::int = SPLIT_PART(academic_year, '-', 1)::int + 1)
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS program_terms (
  program_id  INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  part        SMALLINT NOT NULL CHECK (part IN (1, 2)),
  semester    TEXT NOT NULL CHECK (semester IN ('first', 'second', 'midyear')),
  PRIMARY KEY (program_id, part),
  UNIQUE (program_id, semester)
);
