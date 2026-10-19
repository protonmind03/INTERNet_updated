-- 066: an absence for half a day.
--
-- A trainee who misses the morning and times in for the afternoon may file
-- a reason for the morning alone. So an absence is now for a part of a day:
--
--   absences.part   'day' (the whole day), 'am' (the morning) or 'pm' (the
--                   afternoon). Existing rows get 'day', which is what each
--                   of them was.
--
-- One absence per student per day becomes one per student, day and part:
-- the old unique constraint on (student_id, date) is dropped (its name is
-- looked up, since it was declared inline in 010) and a unique index on
-- (student_id, date, part) takes its place. A morning and an afternoon may
-- both be filed; a whole day may not sit beside either half, and the
-- trigger below refuses that either way round.
--
-- Additive and safe to run again.

ALTER TABLE absences ADD COLUMN IF NOT EXISTS part VARCHAR(3) NOT NULL DEFAULT 'day';

DO $$
DECLARE
  old_name TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'absences_part_check') THEN
    ALTER TABLE absences ADD CONSTRAINT absences_part_check
      CHECK (part IN ('day', 'am', 'pm')) NOT VALID;
  END IF;

  -- The inline UNIQUE (student_id, date) from 010, whatever it is called.
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  WHERE c.conrelid = 'absences'::regclass
    AND c.contype = 'u'
    AND (
      SELECT ARRAY_AGG(a.attname::text ORDER BY a.attname::text)
      FROM pg_attribute a
      WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    ) = ARRAY['date', 'student_id'];
  IF old_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE absences DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_absences_student_date_part
  ON absences (student_id, date, part);

CREATE OR REPLACE FUNCTION absences_part_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.part = 'day' THEN
    IF EXISTS (
      SELECT 1 FROM absences b
      WHERE b.student_id = NEW.student_id AND b.date = NEW.date
        AND b.part IN ('am', 'pm') AND b.id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'A half-day absence is already filed for %; a whole-day absence cannot sit beside it.', NEW.date
        USING ERRCODE = '23505';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM absences b
      WHERE b.student_id = NEW.student_id AND b.date = NEW.date
        AND b.part = 'day' AND b.id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'A whole-day absence is already filed for %; a half-day absence cannot sit beside it.', NEW.date
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_absences_part_guard ON absences;
CREATE TRIGGER trg_absences_part_guard
  BEFORE INSERT OR UPDATE OF student_id, date, part ON absences
  FOR EACH ROW EXECUTE FUNCTION absences_part_guard();
