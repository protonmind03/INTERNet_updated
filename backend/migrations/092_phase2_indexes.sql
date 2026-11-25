-- 092: indexes for two Phase 2 foreign keys (November 2026).
--
-- Migration 075 indexes every foreign key; two added since did not get one.
--
--   site_visits.student_id     (087) a check-in about one student; deleting
--                              a student cascades here
--   company_choices.company_id (086) the existing index leads with term_id,
--                              so deleting a company had none to use

CREATE INDEX IF NOT EXISTS idx_site_visits_student ON site_visits (student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_choices_company_only ON company_choices (company_id);
