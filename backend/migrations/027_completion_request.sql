-- 027: asking for a completion review.
--
-- When everything on a student's completion checklist is done, they ask
-- the coordinator, once, to review their record. This is when they asked.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS completion_requested_at TIMESTAMP;
