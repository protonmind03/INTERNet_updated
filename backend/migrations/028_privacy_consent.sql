-- 028: a student's agreement to the privacy notice.
--
-- When they agreed, and to which version of the notice. A student who has
-- not agreed to the current version is shown it before their next time-in.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS privacy_consent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS privacy_consent_version TEXT;
