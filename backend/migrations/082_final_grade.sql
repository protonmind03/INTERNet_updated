-- 082: the instructor's evaluation and the final OJT grade (Phase 1.5, November 2026).
--
-- The final grade is two halves:
--
--   the HTE's      the supervisor's final evaluation (final_evaluations.grade,
--                  FM-AA-INT-13, migration 074), out of 100
--   the instructor's  four scores out of 100 written by the coordinator:
--                  logs, punctuality, preparation and conduct, weighed by the
--                  term's weights (terms.grade_weights, 25 each unless set)
--
--   final = HTE x split + instructor x (100 - split), / 100, to 2 decimals
--
-- where the split is the OJT rule grade_split_hte (ojt_settings, 50 unless
-- set; services/ojtSettings.ts). A grade is final only when both halves
-- exist. The student sees it only once it is released: released_at, with
-- the grade as it was then (released_grade), so a later change to either
-- half does not change what the student was given until it is released
-- again.
--
-- version counts the saves of an evaluation; a save names the version it
-- was made from, so two people editing at once do not overwrite each other.

CREATE TABLE IF NOT EXISTS instructor_evaluations (
  id                 SERIAL PRIMARY KEY,
  student_id         VARCHAR(50) NOT NULL,
  term_id            INTEGER,
  evaluator_id       VARCHAR(50) NOT NULL,
  logs_score         NUMERIC(5,2) NOT NULL CHECK (logs_score BETWEEN 0 AND 100),
  punctuality_score  NUMERIC(5,2) NOT NULL CHECK (punctuality_score BETWEEN 0 AND 100),
  preparation_score  NUMERIC(5,2) NOT NULL CHECK (preparation_score BETWEEN 0 AND 100),
  conduct_score      NUMERIC(5,2) NOT NULL CHECK (conduct_score BETWEEN 0 AND 100),
  remarks            TEXT CHECK (remarks IS NULL OR LENGTH(remarks) <= 2000),
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version            INTEGER NOT NULL DEFAULT 1,
  released_at        TIMESTAMPTZ,
  released_by        VARCHAR(50),
  released_grade     NUMERIC(5,2) CHECK (released_grade IS NULL OR released_grade BETWEEN 0 AND 100)
);

-- One evaluation per student and term (a student with no term has one).
CREATE UNIQUE INDEX IF NOT EXISTS instructor_evaluations_student_term_key
  ON instructor_evaluations (student_id, COALESCE(term_id, 0));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_instructor_evaluations_student') THEN
    ALTER TABLE instructor_evaluations ADD CONSTRAINT fk_instructor_evaluations_student
      FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_instructor_evaluations_term') THEN
    ALTER TABLE instructor_evaluations ADD CONSTRAINT fk_instructor_evaluations_term
      FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- The term's weights for the instructor's four scores, in percent; empty: 25 each.
ALTER TABLE terms ADD COLUMN IF NOT EXISTS grade_weights JSONB;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'terms_grade_weights_shape') THEN
    ALTER TABLE terms ADD CONSTRAINT terms_grade_weights_shape CHECK (
      grade_weights IS NULL OR (
        jsonb_typeof(grade_weights) = 'object'
        AND (grade_weights->>'logs')::numeric + (grade_weights->>'punctuality')::numeric
          + (grade_weights->>'preparation')::numeric + (grade_weights->>'conduct')::numeric = 100
      )
    );
  END IF;
END $$;
