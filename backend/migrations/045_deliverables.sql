-- 045: programme deliverables.
--
-- A requirement (ojt_requirements, migration 006) was a document every
-- student uploads, with no date and always reviewed by the supervisor.
-- It can now also say:
--
--   due_date       a fixed day it is due, or
--   due_rule       'week:6' (due by the end of each student's sixth week,
--                  counted from the start of their term) or 'weekly' (one
--                  due every week of the term)
--   reviewer_role  who reviews what is uploaded: the supervisor, as until
--                  now, or the coordinator
--   applies_to     {"program_ids": [...], "block_ids": [...]}: the programs
--                  and blocks it is asked of. Empty means everyone.
--
-- Every new column has the value that means "as before", so a requirement
-- nobody edits behaves exactly as it did, and code that does not know the
-- columns keeps working.
--
-- A WEEKLY deliverable has one row per week per student in
-- deliverable_items, made by the reminder loop as each week arrives. The
-- loop may run any number of times: the unique key lets a week be made
-- once. An item points at the document uploaded for it.
--
-- deliverable_reminders records that a student was reminded of a one-off
-- deliverable's due date, so they are reminded once. (A weekly item
-- carries its own reminded_at.)
--
-- Additive only. New foreign keys are NOT VALID.

ALTER TABLE ojt_requirements ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE ojt_requirements ADD COLUMN IF NOT EXISTS due_rule TEXT;
ALTER TABLE ojt_requirements ADD COLUMN IF NOT EXISTS reviewer_role TEXT NOT NULL DEFAULT 'supervisor';
ALTER TABLE ojt_requirements ADD COLUMN IF NOT EXISTS applies_to JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ojt_requirements_due_rule_check') THEN
    ALTER TABLE ojt_requirements ADD CONSTRAINT ojt_requirements_due_rule_check
      CHECK (due_rule IS NULL OR due_rule = 'weekly' OR due_rule ~ '^week:[0-9]{1,2}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ojt_requirements_reviewer_role_check') THEN
    ALTER TABLE ojt_requirements ADD CONSTRAINT ojt_requirements_reviewer_role_check
      CHECK (reviewer_role IN ('supervisor', 'coordinator'));
  END IF;
  -- A fixed day or a rule, never both.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ojt_requirements_one_due_check') THEN
    ALTER TABLE ojt_requirements ADD CONSTRAINT ojt_requirements_one_due_check
      CHECK (due_date IS NULL OR due_rule IS NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS deliverable_items (
  id             SERIAL PRIMARY KEY,
  requirement_id INTEGER NOT NULL,
  student_id     VARCHAR(50) NOT NULL,
  period_start   DATE NOT NULL,
  due_date       DATE NOT NULL,
  document_id    INTEGER,
  status         VARCHAR(20) NOT NULL DEFAULT 'Pending'
                   CHECK (status IN ('Pending', 'Submitted', 'Approved', 'Rejected')),
  reminded_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS deliverable_items_once_key
  ON deliverable_items (requirement_id, student_id, period_start);
CREATE INDEX IF NOT EXISTS idx_deliverable_items_student ON deliverable_items (student_id, due_date);
CREATE INDEX IF NOT EXISTS idx_deliverable_items_document ON deliverable_items (document_id) WHERE document_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS deliverable_reminders (
  requirement_id INTEGER NOT NULL,
  student_id     VARCHAR(50) NOT NULL,
  due_date       DATE NOT NULL,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (requirement_id, student_id, due_date)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_deliverable_items_requirement') THEN
    ALTER TABLE deliverable_items ADD CONSTRAINT fk_deliverable_items_requirement
      FOREIGN KEY (requirement_id) REFERENCES ojt_requirements(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_deliverable_items_student') THEN
    ALTER TABLE deliverable_items ADD CONSTRAINT fk_deliverable_items_student
      FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_deliverable_items_document') THEN
    ALTER TABLE deliverable_items ADD CONSTRAINT fk_deliverable_items_document
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_deliverable_reminders_requirement') THEN
    ALTER TABLE deliverable_reminders ADD CONSTRAINT fk_deliverable_reminders_requirement
      FOREIGN KEY (requirement_id) REFERENCES ojt_requirements(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
