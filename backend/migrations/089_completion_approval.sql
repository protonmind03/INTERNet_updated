-- 089: the coordinator approves or returns a completion request (Phase 2.5, November 2026).
--
-- A student asks for a completion review once their checklist is done
-- (migration 027). The coordinator now decides it:
--
--   completion_approved_at, _by, _by_name
--       approved: the OJT is complete in the office's eyes
--   completion_returned_at, completion_return_note
--       returned, with what to fix; the request is cleared (and any
--       approval with it), so the student can ask again once it is fixed
--
-- No certificate is generated (the user's decision, 25 November 2026).

ALTER TABLE students ADD COLUMN IF NOT EXISTS completion_approved_at TIMESTAMPTZ;
ALTER TABLE students ADD COLUMN IF NOT EXISTS completion_approved_by VARCHAR(50);
ALTER TABLE students ADD COLUMN IF NOT EXISTS completion_approved_by_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS completion_returned_at TIMESTAMPTZ;
ALTER TABLE students ADD COLUMN IF NOT EXISTS completion_return_note TEXT;
