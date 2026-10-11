-- 029: a supervisor's correction of the times on a log.
--
-- The latest correction is kept on the log itself, so the student and
-- anyone reading the log can see that its times were changed, by whom and
-- why. Every correction, with the times before and after, is in audit_log.

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS time_corrected_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS time_corrected_by VARCHAR(50),
  ADD COLUMN IF NOT EXISTS time_correction_reason TEXT;
