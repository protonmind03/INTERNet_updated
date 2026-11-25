-- 091: why a time-in came without a photo (Phase 2.7, November 2026).
--
-- The time-in without a photo (recorded_offline, no capture_method) was
-- only for when there was no connection. The camera check now offers it
-- too, after 20 seconds without a pass or when the check cannot start or
-- fails. Which way it came is kept, for the supervisor and for reports:
--
--   no_connection    no signal (and every older no-photo time-in)
--   camera_problem   the camera check could not start, or failed
--   check_too_long   20 seconds without a pass, and the student moved on
--
-- The supervisor confirms every one of them, as before.

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS no_photo_reason TEXT;
UPDATE attendance SET no_photo_reason = 'no_connection'
WHERE no_photo_reason IS NULL AND recorded_offline = TRUE AND image_url IS NULL AND offline_attestation IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_no_photo_reason_check') THEN
    ALTER TABLE attendance ADD CONSTRAINT attendance_no_photo_reason_check
      CHECK (no_photo_reason IS NULL OR no_photo_reason IN ('no_connection', 'camera_problem', 'check_too_long'));
  END IF;
END $$;
