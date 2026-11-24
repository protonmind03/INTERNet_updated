-- 083: Host Training Establishments: type, approval, the notarized MOA,
-- screenings and requests (Phase 1.3, November 2026).
--
-- companies gain:
--   hte_type      government, private or university (CHED's three kinds)
--   status        applied, screening, approved or suspended. Every company
--                 there is today stays approved, so nobody's placement
--                 changes. A student is placed only at an approved company,
--                 and a private one is approved only after a screening that
--                 passed (or passed with conditions).
--   version       counts status changes, so two people deciding at once do
--                 not overwrite each other (expected_version).
--   moa_*         whether the agreement is notarized, when, and the signed
--                 copy in the private file store (coordinators only).
--
-- Slots (companies.slots, migration 020) are now enforced when a student is
-- placed: the server locks the company's row, counts its active students in
-- the same term, and refuses the placement once they fill it
-- (services/placement.ts). NULL slots means no limit.
--
-- company_screenings: a visit's ratings, 1 to 5 with a note each, and the
-- decision. company_requests: an agency a student or coordinator suggests;
-- approving one makes the company, in screening.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS hte_type TEXT NOT NULL DEFAULT 'government';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS moa_notarized BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS moa_notarized_on DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS moa_document_path TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS moa_document_name TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS moa_document_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_hte_type_check') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_hte_type_check CHECK (hte_type IN ('government', 'private', 'university'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_status_check') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_status_check CHECK (status IN ('applied', 'screening', 'approved', 'suspended'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS company_screenings (
  id                     SERIAL PRIMARY KEY,
  company_id             INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  screened_by            VARCHAR(50) NOT NULL,
  screened_on            DATE NOT NULL,
  standing               SMALLINT NOT NULL CHECK (standing BETWEEN 1 AND 5),
  standing_note          TEXT CHECK (standing_note IS NULL OR LENGTH(standing_note) <= 500),
  work_environment       SMALLINT NOT NULL CHECK (work_environment BETWEEN 1 AND 5),
  work_environment_note  TEXT CHECK (work_environment_note IS NULL OR LENGTH(work_environment_note) <= 500),
  space_capacity         SMALLINT NOT NULL CHECK (space_capacity BETWEEN 1 AND 5),
  space_capacity_note    TEXT CHECK (space_capacity_note IS NULL OR LENGTH(space_capacity_note) <= 500),
  safety                 SMALLINT NOT NULL CHECK (safety BETWEEN 1 AND 5),
  safety_note            TEXT CHECK (safety_note IS NULL OR LENGTH(safety_note) <= 500),
  decision               TEXT NOT NULL CHECK (decision IN ('pass', 'conditional', 'fail')),
  notes                  TEXT CHECK (notes IS NULL OR LENGTH(notes) <= 2000),
  version                INTEGER NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_screenings_company ON company_screenings (company_id, screened_on DESC);

CREATE TABLE IF NOT EXISTS company_requests (
  id                 SERIAL PRIMARY KEY,
  requested_by_role  TEXT NOT NULL CHECK (requested_by_role IN ('student', 'coordinator')),
  requested_by_id    VARCHAR(50) NOT NULL,
  company_name       TEXT NOT NULL CHECK (LENGTH(TRIM(company_name)) BETWEEN 2 AND 150),
  hte_type           TEXT NOT NULL DEFAULT 'private' CHECK (hte_type IN ('government', 'private', 'university')),
  address            TEXT CHECK (address IS NULL OR LENGTH(address) <= 300),
  contact            TEXT CHECK (contact IS NULL OR LENGTH(contact) <= 200),
  reason             TEXT NOT NULL CHECK (LENGTH(TRIM(reason)) BETWEEN 10 AND 1000),
  status             TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'screening', 'approved', 'rejected')),
  decided_by         VARCHAR(50),
  decided_at         TIMESTAMPTZ,
  decision_note      TEXT CHECK (decision_note IS NULL OR LENGTH(decision_note) <= 500),
  company_id         INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  version            INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_requests_status ON company_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_requests_requester ON company_requests (requested_by_role, requested_by_id);

-- A student counts against one term's slots: placements are counted per term.
CREATE INDEX IF NOT EXISTS idx_students_company_term ON students (company_id, term_id) WHERE is_active = TRUE;
