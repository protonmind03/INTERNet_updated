-- 051: how far the phone's clock was from the server's.
--
-- A step recorded offline (lunch, back from lunch, time-out, and a time-in
-- with no connection) carries the time on the phone's clock. When it is
-- sent, the app now also sends the phone's clock at that moment, and the
-- server keeps the difference in whole seconds: positive when the phone
-- was ahead, negative when it was behind. A reviewer is shown it when it is
-- more than a minute, because a phone clock set wrong moves every offline
-- time by the same amount.
--
--   offline_action_ledger.clock_skew_seconds  the gap when that step arrived
--   attendance.clock_skew_seconds             the largest gap seen on that log
--
-- Every existing row, and every step from a copy of the app that does not
-- send its clock, keeps NULL, which means "not measured" (not "no gap").
--
-- Additive only.

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS clock_skew_seconds INTEGER;
ALTER TABLE offline_action_ledger ADD COLUMN IF NOT EXISTS clock_skew_seconds INTEGER;
