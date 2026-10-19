-- 070: notifications that ask for something, and notifications that only tell.
--
-- The bell had one list. A trainee now sees what asks them to act (retake
-- a photo, time out, submit a task) apart from what only informs them
-- (welcome, a supervisor assigned, a schedule change), which sits with the
-- coordinator's announcements.
--
--   kind             'action' (opens a page where something is done) or
--                    'info' (read in a dialog). Existing rows: 'action'
--                    when they have a link to open, 'info' when not.
--   action_required  the action list shows "Action needed" while this is
--                    true and acted_at is empty. Existing rows: FALSE, so
--                    nothing old is suddenly flagged.
--   acted_at         when the expected act was done (the photo retaken,
--                    the task submitted, the time-out entered); set by the
--                    route that performs it. Existing rows: NULL.
--
-- Which notification is which is decided where every notification is
-- written (services/notificationKinds.ts).
--
-- Additive and safe to run again.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS kind VARCHAR(10),
  ADD COLUMN IF NOT EXISTS action_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS acted_at TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_kind_check') THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
      CHECK (kind IS NULL OR kind IN ('action', 'info')) NOT VALID;
  END IF;
END $$;

UPDATE notifications SET kind = CASE WHEN link IS NULL THEN 'info' ELSE 'action' END
WHERE kind IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_student_kind
  ON notifications (student_id, kind, created_at DESC) WHERE student_id IS NOT NULL;
