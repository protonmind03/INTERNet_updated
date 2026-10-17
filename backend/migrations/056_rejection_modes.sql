-- 056: two kinds of rejection, and a window to retake a rejected photo.
--
-- A supervisor now rejects either the time-in photo or the whole day.
--
--   attendance.rejection_scope         'time_in' (the photo) or 'attendance'
--                                      (the day). NULL: never rejected.
--   attendance.photo_rejection_reason  why the photo was rejected,
--   attendance.photo_rejected_at       when, and
--   attendance.photo_rejected_by       by which supervisor.
--   attendance.photo_redo_status       'required' while a new photo is due,
--                                      'submitted' once one was taken,
--                                      'missed' when the window closed first.
--   attendance.photo_redo_due_at       when the window closes, Philippine
--                                      wall time. NULL while it closes at
--                                      "Back from lunch" (or at time-out).
--   attendance.rejected_photo_path     the photo that was rejected, kept for
--                                      the record when a new one replaces it.
--   attendance.times_before_correction the times as they were before a
--                                      supervisor corrected them, so an
--                                      appeal can restore them.
--
-- After a photo rejection the log stays open and Pending and its hours keep
-- counting. If the window closes without a new photo, the server sets the
-- log Rejected ("Photo not retaken in time") and adds an Unexcused absence
-- for the day (services/photoRedo.ts).
--
-- Existing rows: every log already Rejected was a rejection of the day, so
-- it gets rejection_scope 'attendance'. Every other column stays NULL: no
-- photo was ever rejected before this, and no earlier correction kept its
-- previous times (those are in the audit log only).
--
-- Additive and safe to run again.

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS rejection_scope VARCHAR(20),
  ADD COLUMN IF NOT EXISTS photo_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS photo_rejected_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS photo_rejected_by VARCHAR(50),
  ADD COLUMN IF NOT EXISTS photo_redo_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS photo_redo_due_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS rejected_photo_path TEXT,
  ADD COLUMN IF NOT EXISTS times_before_correction JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_rejection_scope_check') THEN
    ALTER TABLE attendance ADD CONSTRAINT attendance_rejection_scope_check
      CHECK (rejection_scope IS NULL OR rejection_scope IN ('time_in', 'attendance'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_photo_redo_status_check') THEN
    ALTER TABLE attendance ADD CONSTRAINT attendance_photo_redo_status_check
      CHECK (photo_redo_status IS NULL OR photo_redo_status IN ('required', 'submitted', 'missed'));
  END IF;
END $$;

UPDATE attendance SET rejection_scope = 'attendance'
WHERE status = 'Rejected' AND rejection_scope IS NULL;

-- The minute job looks only at logs waiting on a new photo.
CREATE INDEX IF NOT EXISTS idx_attendance_photo_redo_required
  ON attendance (photo_redo_due_at) WHERE photo_redo_status = 'required';
