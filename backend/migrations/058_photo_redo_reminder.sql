-- 058: a reminder before the window to retake a rejected photo closes.
--
-- When the window has a set end (60 minutes after a photo rejected once
-- lunch was over), the student is reminded 15 minutes before it closes
-- (services/photoRedo.ts, in the minute loop).
--
--   attendance.photo_redo_reminded_at   when that reminder was sent, so it
--                                       is sent once. NULL: not sent.
--
-- Existing rows: NULL, which is right for all of them; no reminder was
-- ever sent before this.
--
-- Additive and safe to run again.

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS photo_redo_reminded_at TIMESTAMP;
