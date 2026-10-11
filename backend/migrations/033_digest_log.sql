-- 033: which summary emails have been sent.
--
-- One row per email: the kind of summary, who it went to, and the period
-- it covers (a date for the supervisor's daily one, the Monday of the week
-- for the coordinator's weekly one). The unique index is what keeps a
-- summary from being sent twice, however often the check runs.

CREATE TABLE IF NOT EXISTS digest_log (
  id SERIAL PRIMARY KEY,
  kind VARCHAR(30) NOT NULL,
  account_id VARCHAR(50) NOT NULL,
  period_key VARCHAR(10) NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_digest_log
  ON digest_log (kind, account_id, period_key);
