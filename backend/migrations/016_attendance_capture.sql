-- 016: how each attendance photo was taken.
--
-- A student's time-in photo now comes from the in-app camera check (a live
-- face has to follow a few prompts before the photo is taken). When that
-- check cannot run on the student's device, the supervisor takes the photo
-- from their own portal instead, and that log is approved on their word.

ALTER TABLE attendance
  -- 'liveness'   the student passed the camera check
  -- 'supervisor' the supervisor took the photo for the student
  -- NULL         logged before this migration, from an ordinary photo
  ADD COLUMN IF NOT EXISTS capture_method TEXT
    CHECK (capture_method IN ('liveness', 'supervisor')),
  -- What the camera check reported: the prompts completed, whether the
  -- screen-light check was conclusive, and how sharp the photo was.
  ADD COLUMN IF NOT EXISTS liveness_checks JSONB,
  -- The supervisor who took the photo, and why the camera check was not used.
  ADD COLUMN IF NOT EXISTS recorded_by TEXT,
  ADD COLUMN IF NOT EXISTS capture_reason TEXT;
