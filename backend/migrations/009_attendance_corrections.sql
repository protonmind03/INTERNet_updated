-- 009: attendance corrections.
--
-- A student can now (a) enter the time-out they forgot on an earlier day and
-- (b) ask for a rejected log to be reviewed again. Both put the log back in
-- front of the supervisor as Pending. These columns keep what the student
-- said and when, so the reviewer can tell a corrected log from an ordinary
-- one.

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS correction_note TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS corrected_at   TIMESTAMP;
