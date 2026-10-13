-- 049: a time-in recorded with no connection.
--
-- A student with no signal can now record their time-in on the phone; it
-- is sent when the connection is back. The camera check cannot run with
-- no connection, so such a log has no photo and no check. It is created
-- "Pending" like any other and counts for nothing until the supervisor
-- confirms it, which they must do for that log on its own, having been
-- told there is no photo.
--
-- `offline_time_in_request` is the id the phone gave that time-in. It is
-- NULL for every other log, so "was this time-in recorded offline" is
-- "is it set". It also makes sending the same time-in twice record it
-- once: the second arrival finds its own id on the day's log.
--
-- Additive only. Every existing log keeps NULL, which means "as before".

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS offline_time_in_request TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_offline_time_in_request_key
  ON attendance (offline_time_in_request)
  WHERE offline_time_in_request IS NOT NULL;
