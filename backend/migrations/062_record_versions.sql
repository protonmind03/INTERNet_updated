-- 062: a version on every record someone decides on.
--
-- Two people can open the same log, task or document and decide it at
-- once (a supervisor on a phone and on a laptop, or the coordinator while
-- the supervisor is away). Each review decision now sends the version of
-- the record it was looking at (expected_version); if the record has
-- changed since, the decision is refused with 409 and the record as it is
-- now, instead of quietly overwriting what the other person decided
-- (services/versions.ts).
--
--   version    on attendance, tasks, documents, absences, journals and
--              attendance_appeals: 1 when written, one more on every
--              change to the row, whoever makes it (a trigger,
--              inb_bump_version). Existing rows: 1.
--
-- A request that sends no expected_version is decided as before, so an
-- older copy of the app still works.
--
-- Additive and safe to run again.

ALTER TABLE attendance        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tasks             ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE documents         ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE absences          ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE journals          ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE attendance_appeals ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION inb_bump_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only a real change moves the version; an update that leaves the row as it was does not.
  IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
  END IF;
  RETURN NEW;
END
$$;

DO $$
DECLARE
  name TEXT;
BEGIN
  FOREACH name IN ARRAY ARRAY['attendance', 'tasks', 'documents', 'absences', 'journals', 'attendance_appeals'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trg_' || name || '_version' AND tgrelid = name::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION inb_bump_version()',
        'trg_' || name || '_version',
        name
      );
    END IF;
  END LOOP;
END $$;
