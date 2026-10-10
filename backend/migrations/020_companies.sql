-- 020: host companies as records of their own.
--
-- Until now a company was only a word typed on a student or supervisor, so
-- "Acme Corp" and "ACME Corporation" were two companies and nothing could
-- be recorded about either. This adds a companies table (address, contact,
-- the agreement's dates, how many interns it takes) and links students,
-- supervisors and complaints to it.
--
-- The text columns stay and stay authoritative for display: students.company,
-- supervisors.company, complaints.company_name. Nothing that reads them
-- changes. The new company_id columns are filled in automatically:
--
-- * a trigger sets company_id whenever a row's company text is written, by
--   matching it to a company name (ignoring case and outer spaces), so every
--   way of creating or editing an account links itself;
-- * rows that existed before are linked by the backfill script
--   (npm run db:backfill-companies), which is run by hand after review.
--
-- Additive only. New foreign keys are NOT VALID.

CREATE TABLE IF NOT EXISTS companies (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL CHECK (LENGTH(TRIM(name)) BETWEEN 2 AND 150),
  address        TEXT,
  contact_person TEXT,
  contact_email  TEXT,
  contact_phone  TEXT,
  -- The memorandum of agreement with the university.
  moa_start      DATE,
  moa_expiry     DATE,
  -- How many interns the company agreed to take; NULL when not stated.
  slots          INTEGER CHECK (slots IS NULL OR slots >= 0),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (moa_start IS NULL OR moa_expiry IS NULL OR moa_expiry >= moa_start)
);

-- One company per name, whatever its capitals or outer spaces.
CREATE UNIQUE INDEX IF NOT EXISTS companies_name_key ON companies (LOWER(TRIM(name)));

ALTER TABLE students    ADD COLUMN IF NOT EXISTS company_id INTEGER;
ALTER TABLE supervisors ADD COLUMN IF NOT EXISTS company_id INTEGER;
ALTER TABLE complaints  ADD COLUMN IF NOT EXISTS company_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_students_company_id    ON students (company_id);
CREATE INDEX IF NOT EXISTS idx_supervisors_company_id ON supervisors (company_id);
CREATE INDEX IF NOT EXISTS idx_complaints_company_id  ON complaints (company_id);

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('fk_students_company',    'students'),
      ('fk_supervisors_company', 'supervisors'),
      ('fk_complaints_company',  'complaints')
    ) AS t(name, tbl)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.name) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID',
        fk.tbl, fk.name
      );
    END IF;
  END LOOP;
END $$;

-- Keeps company_id in step with the company text on the same row.
CREATE OR REPLACE FUNCTION link_company_from_text() RETURNS trigger AS $$
DECLARE
  typed TEXT;
BEGIN
  IF TG_TABLE_NAME = 'complaints' THEN
    typed := NEW.company_name;
  ELSE
    typed := NEW.company;
  END IF;

  IF typed IS NULL OR TRIM(typed) = '' THEN
    NEW.company_id := NULL;
  ELSE
    NEW.company_id := (
      SELECT id FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM(typed))
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_students_link_company ON students;
CREATE TRIGGER trg_students_link_company
  BEFORE INSERT OR UPDATE OF company ON students
  FOR EACH ROW EXECUTE FUNCTION link_company_from_text();

DROP TRIGGER IF EXISTS trg_supervisors_link_company ON supervisors;
CREATE TRIGGER trg_supervisors_link_company
  BEFORE INSERT OR UPDATE OF company ON supervisors
  FOR EACH ROW EXECUTE FUNCTION link_company_from_text();

DROP TRIGGER IF EXISTS trg_complaints_link_company ON complaints;
CREATE TRIGGER trg_complaints_link_company
  BEFORE INSERT OR UPDATE OF company_name ON complaints
  FOR EACH ROW EXECUTE FUNCTION link_company_from_text();
