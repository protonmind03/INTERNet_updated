-- 030: a supervisor's certification of one month of a student's time record.
--
-- One per student per month ("YYYY-MM"). It records who certified it, when,
-- and the verified hours and days logged at that moment, so the printed
-- record says what was certified even if a log is corrected afterwards.

CREATE TABLE IF NOT EXISTS dtr_certifications (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  month CHAR(7) NOT NULL,
  certified_by VARCHAR(50) NOT NULL,
  certified_by_name TEXT NOT NULL,
  verified_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  days_logged INTEGER NOT NULL DEFAULT 0,
  certified_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dtr_certifications_student_month
  ON dtr_certifications (student_id, month);
