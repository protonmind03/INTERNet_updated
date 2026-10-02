-- =====================================================================
-- MIGRATION 003 — Lets a supervisor file a complaint themselves.
--
-- The original complaints table only ever recorded a student_id as the
-- filer (report_type distinguished "about myself" vs "about my
-- supervisor", but the filer was always assumed to be a student). The
-- design doc lists Supervisor as an actor who can file complaints too,
-- so this adds a second, nullable filer column instead of touching the
-- existing student_id column — the original student complaint flow is
-- completely unaffected.
--
-- Idempotent — safe to run more than once.
-- =====================================================================

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS filed_by_supervisor_id VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_complaints_supervisor ON complaints(filed_by_supervisor_id);
