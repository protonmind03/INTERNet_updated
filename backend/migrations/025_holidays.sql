-- 025: holidays.
--
-- Days nobody is expected to report: national holidays, and days the
-- campus or the programme declares. Entered by the coordinator, one per
-- date. The schedule and the Daily Time Record show them.

CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  created_by VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_holidays_date ON holidays (holiday_date);
