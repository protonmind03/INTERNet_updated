-- 022: what the student did that day.
--
-- At time-out the student writes a short note of what they accomplished. It
-- goes to the supervisor with the log and onto the printed time record, so
-- a day's hours come with a line saying what they were spent on.
--
-- Optional in the database. The app asks for it at time-out; logs from
-- before this migration, and a time-out entered some other way, have none.

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS accomplishments TEXT;
