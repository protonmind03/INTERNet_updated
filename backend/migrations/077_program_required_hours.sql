-- 077: required OJT hours per program (Phase 0.3, November 2026).
--
-- Until now every new student got 180 required hours unless the
-- coordinator typed another number. A program now carries its own:
-- a student created or imported without hours gets the program's, and
-- then 180 as before. A value given for one student always wins.
--
-- Known hours are set for BPA (400), BSIT (480) and BSBA (600), found by
-- short code as seeded in 038, and only where the program has none yet,
-- so running this again, or after a coordinator changed them, keeps what
-- is there. The other programs stay NULL (180 applies).
--
-- Existing students are not changed: students.required_hours keeps the
-- value each one already has.

ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS required_hours INTEGER NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'programs_required_hours_range'
      AND conrelid = 'programs'::regclass
  ) THEN
    ALTER TABLE programs
      ADD CONSTRAINT programs_required_hours_range
      CHECK (required_hours BETWEEN 1 AND 5000);
  END IF;
END
$$;

UPDATE programs p
SET required_hours = seed.hours
FROM (VALUES ('BPA', 400), ('BSIT', 480), ('BSBA', 600)) AS seed(short_code, hours)
WHERE LOWER(TRIM(p.short_code)) = LOWER(seed.short_code)
  AND p.required_hours IS NULL;
