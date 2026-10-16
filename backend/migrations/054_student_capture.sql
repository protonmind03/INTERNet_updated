-- 054: a lighter camera check by default, a stricter one after a rejection,
-- and which concern replies a student has not read yet.
--
--   students.liveness_strict   TRUE while the student's time-ins get the
--                              full check: two head turns and the colour
--                              light test. The server turns it on when one
--                              of the student's logs is rejected and off
--                              when one of their logs is next verified
--                              (worked out again after every decision, so
--                              a decision withdrawn is undone too). FALSE,
--                              the default, means one or two head turns and
--                              no colour test.
--
--   complaints.filer_seen_at   When whoever filed the concern last opened
--                              its conversation. A coordinator reply newer
--                              than this is a new reply, counted on the
--                              Resolution Center icon. NULL means never
--                              opened: every reply counts as new.
--
-- Existing rows: every student starts with the lighter check (no one is
-- put into the strict check by a rejection made before this change).
-- Every concern that already exists counts as read at the moment this
-- runs, so no student sees an old reply announced as new. Concerns filed
-- afterwards start as NULL.
--
-- The check used for each time-in is kept in attendance.liveness_checks
-- as "level": "standard" or "strict"; logs from before have no level.
--
-- Additive and safe to run again.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS liveness_strict BOOLEAN NOT NULL DEFAULT FALSE;

-- The default fills the rows that exist now, once (a second run finds the
-- column there and adds nothing); dropping it leaves new concerns NULL.
ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS filer_seen_at TIMESTAMP DEFAULT NOW();
ALTER TABLE complaints
  ALTER COLUMN filer_seen_at DROP DEFAULT;
