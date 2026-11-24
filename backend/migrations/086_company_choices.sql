-- 086: students choose their agency, and the coordinator assigns (Phase 2.2, November 2026).
--
--   terms.choice_opens_at, choice_closes_at
--       the term's choice window, opened by a coordinator. Outside it a
--       student's choices are read-only.
--   company_programs
--       the programs a company takes; a company with none listed takes any.
--   company_choices
--       a student's ranked choices for a term, 1 to 3: approved, active
--       companies that take their program and had a free slot when chosen.
--       The coordinator assigns from them (or directly); slots are checked
--       again then (services/placement.ts).

ALTER TABLE terms ADD COLUMN IF NOT EXISTS choice_opens_at TIMESTAMPTZ;
ALTER TABLE terms ADD COLUMN IF NOT EXISTS choice_closes_at TIMESTAMPTZ;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'terms_choice_window_check') THEN
    ALTER TABLE terms ADD CONSTRAINT terms_choice_window_check CHECK (
      (choice_opens_at IS NULL) = (choice_closes_at IS NULL)
      AND (choice_closes_at IS NULL OR choice_closes_at > choice_opens_at)
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS company_programs (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  PRIMARY KEY (company_id, program_id)
);

CREATE TABLE IF NOT EXISTS company_choices (
  student_id  VARCHAR(50) NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  term_id     INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  rank        SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 3),
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  chosen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, term_id, rank),
  UNIQUE (student_id, term_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_company_choices_company ON company_choices (term_id, company_id);
