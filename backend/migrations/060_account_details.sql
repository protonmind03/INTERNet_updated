-- 060: the details people need to reach and identify each other.
--
-- Roadmap 5.3. Every field is optional; the server checks what is written
-- (routes/accountDetails.ts), and a coordinator changing someone else's is
-- audited (the names of the fields changed, never their values).
--
--   supervisors   mobile_number, show_mobile (the mobile is shown to their
--                 interns only when this is TRUE), job_title, work_phone,
--                 contact_hours, preferred_contact. Their department and
--                 company link already exist.
--   coordinators  mobile_number, show_mobile, position, office_hours,
--                 preferred_contact, employee_number, college_id (the
--                 college they serve), office_location. Their department
--                 already exists and is the "office or department".
--   students      preferred_contact. Their mobile and emergency contact
--                 already exist (migration 023).
--   companies     industry, website, hr_contact. The main office address
--                 is the existing address.
--
-- preferred_contact is one of 'email', 'mobile', 'message' (in INTERNet)
-- or 'office' (in person).
--
-- Existing rows: every new column is NULL (or FALSE for show_mobile), which
-- is right for all of them: nothing was recorded before, and no mobile is
-- shown until its owner chooses to show it.
--
-- Additive and safe to run again.

ALTER TABLE supervisors
  ADD COLUMN IF NOT EXISTS mobile_number     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS show_mobile       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS job_title         VARCHAR(120),
  ADD COLUMN IF NOT EXISTS work_phone        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS contact_hours     VARCHAR(120),
  ADD COLUMN IF NOT EXISTS preferred_contact VARCHAR(10);

ALTER TABLE coordinators
  ADD COLUMN IF NOT EXISTS mobile_number     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS show_mobile       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS position          VARCHAR(120),
  ADD COLUMN IF NOT EXISTS office_hours      VARCHAR(120),
  ADD COLUMN IF NOT EXISTS preferred_contact VARCHAR(10),
  ADD COLUMN IF NOT EXISTS employee_number   VARCHAR(40),
  ADD COLUMN IF NOT EXISTS college_id        INTEGER,
  ADD COLUMN IF NOT EXISTS office_location   VARCHAR(150);

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS preferred_contact VARCHAR(10);

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS industry   VARCHAR(120),
  ADD COLUMN IF NOT EXISTS website    VARCHAR(200),
  ADD COLUMN IF NOT EXISTS hr_contact VARCHAR(150);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supervisors_preferred_contact_check') THEN
    ALTER TABLE supervisors ADD CONSTRAINT supervisors_preferred_contact_check
      CHECK (preferred_contact IS NULL OR preferred_contact IN ('email', 'mobile', 'message', 'office')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coordinators_preferred_contact_check') THEN
    ALTER TABLE coordinators ADD CONSTRAINT coordinators_preferred_contact_check
      CHECK (preferred_contact IS NULL OR preferred_contact IN ('email', 'mobile', 'message', 'office')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_preferred_contact_check') THEN
    ALTER TABLE students ADD CONSTRAINT students_preferred_contact_check
      CHECK (preferred_contact IS NULL OR preferred_contact IN ('email', 'mobile', 'message', 'office')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_coordinators_college') THEN
    ALTER TABLE coordinators ADD CONSTRAINT fk_coordinators_college
      FOREIGN KEY (college_id) REFERENCES colleges (id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
