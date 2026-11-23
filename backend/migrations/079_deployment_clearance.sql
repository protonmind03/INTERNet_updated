-- 079: academic eligibility and deployment clearance (Phase 1.2, November 2026).
--
-- A student may start OJT only once they are academically eligible, every
-- requirement needed before deployment (migration 078) that applies to
-- them is approved, and a company is assigned. The coordinator records
-- the eligibility check and clears the student; "clear anyway" needs a
-- reason. Both are audited (services/audit.ts).
--
--   students.eligibility_status   unchecked (as before), eligible, deficient
--   students.eligibility_note     what the check found ("Missing IT 312")
--   students.eligibility_checked_by / _at
--   students.cleared_for_deployment_at / cleared_by
--   students.clearance_override_reason   set when cleared without everything
--
-- The gate itself is a setting, deployment_gate_enabled, in the new table
-- ojt_settings: rules of the OJT programme as a whole, one row a key,
-- like attendance_rules (migration 065). It starts OFF, so production
-- keeps working exactly as today until the OJT office turns it on. The
-- overtime limit and the grade split (Phase 1.4, 1.5) go in the same table.

ALTER TABLE students ADD COLUMN IF NOT EXISTS eligibility_status TEXT NOT NULL DEFAULT 'unchecked';
ALTER TABLE students ADD COLUMN IF NOT EXISTS eligibility_note TEXT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS eligibility_checked_by VARCHAR(50) NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS eligibility_checked_at TIMESTAMPTZ NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS cleared_for_deployment_at TIMESTAMPTZ NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS cleared_by VARCHAR(50) NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS clearance_override_reason TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_eligibility_status_check') THEN
    ALTER TABLE students ADD CONSTRAINT students_eligibility_status_check
      CHECK (eligibility_status IN ('unchecked', 'eligible', 'deficient'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS ojt_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_by VARCHAR(50),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ojt_settings (key, value) VALUES ('deployment_gate_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
