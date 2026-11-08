-- 076: the supervisor's evening summary of daily reports (November 2026).
--
-- Each evening a supervisor whose interns wrote that day's report gets one
-- notification saying how many did (services/supervisorDigest.ts). One row
-- per supervisor per day is what keeps it to one, even with two copies of
-- the server or a restart; the claim and the count are one statement, as
-- for time_out_reminders. A new table only: nothing else changes.

CREATE TABLE IF NOT EXISTS supervisor_report_digests (
  supervisor_id VARCHAR(50) NOT NULL,
  digest_date   DATE NOT NULL,
  wrote         INTEGER NOT NULL,
  interns       INTEGER NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (supervisor_id, digest_date)
);
