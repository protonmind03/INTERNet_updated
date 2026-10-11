-- 037: colleges, programs, majors and blocks as records of their own.
--
-- Until now a student's program was only a word typed on their account, so
-- "BSIT", "BS Info Tech" and "BS Information Technology" were three
-- programs, and nothing could be filtered or counted by college, program
-- or section. This adds the four tables and links students to them.
--
--   colleges   a college of the campus
--   programs   a degree program of a college, with a short code ("BSIT")
--              and whether OJT applies to it
--   majors     a major or specialization of a program
--   blocks     a section of a program in a year level ("BSIT 4A"),
--              optionally of one major and of one term
--
-- students.program stays, and stays the text that is displayed, exactly as
-- students.company did when companies became records (migration 020).
-- Nothing that reads it changes. The new students.program_id is filled in
-- two ways:
--
-- * a trigger sets it whenever a student's program text is written, by
--   matching the text to a program's name or short code (ignoring case and
--   outer spaces), so every way of creating or editing an account links
--   itself;
-- * rows that existed before, and spellings that match nothing, are linked
--   by the backfill script (npm run db:backfill-programs), which is run by
--   hand from a mapping a person wrote.
--
-- The trigger differs from 020's in one way. A student linked by the
-- backfill carries text that does not match ("BS Info Tech"), so the
-- trigger must not undo that link the next time the row is saved with the
-- same text. It therefore works the link out again only when the text
-- itself changes, and leaves a program_id that the same statement set on
-- purpose.
--
-- Additive only. New foreign keys are NOT VALID. Older code that knows
-- nothing of these tables keeps working: every new column is nullable.

CREATE TABLE IF NOT EXISTS colleges (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL CHECK (LENGTH(TRIM(name)) BETWEEN 2 AND 150),
  short_name TEXT CHECK (short_name IS NULL OR LENGTH(TRIM(short_name)) BETWEEN 1 AND 20),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One college per name, whatever its capitals or outer spaces.
CREATE UNIQUE INDEX IF NOT EXISTS colleges_name_key ON colleges (LOWER(TRIM(name)));

CREATE TABLE IF NOT EXISTS programs (
  id          SERIAL PRIMARY KEY,
  college_id  INTEGER NOT NULL,
  name        TEXT NOT NULL CHECK (LENGTH(TRIM(name)) BETWEEN 2 AND 150),
  -- What a block's name starts with: "BSIT" in "BSIT 4A".
  short_code  TEXT NOT NULL CHECK (LENGTH(TRIM(short_code)) BETWEEN 2 AND 20),
  -- Programs with no OJT in their curriculum can be kept out of pickers.
  ojt_applies BOOLEAN NOT NULL DEFAULT TRUE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A program's name and its short code are each one of a kind on the campus,
-- so text typed on a student can only ever mean one program.
CREATE UNIQUE INDEX IF NOT EXISTS programs_name_key ON programs (LOWER(TRIM(name)));
CREATE UNIQUE INDEX IF NOT EXISTS programs_short_code_key ON programs (LOWER(TRIM(short_code)));
CREATE INDEX IF NOT EXISTS idx_programs_college_id ON programs (college_id);

CREATE TABLE IF NOT EXISTS majors (
  id         SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL,
  name       TEXT NOT NULL CHECK (LENGTH(TRIM(name)) BETWEEN 2 AND 150),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS majors_program_name_key ON majors (program_id, LOWER(TRIM(name)));

CREATE TABLE IF NOT EXISTS blocks (
  id         SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL,
  major_id   INTEGER,
  year_level SMALLINT NOT NULL CHECK (year_level BETWEEN 1 AND 6),
  section    TEXT NOT NULL CHECK (LENGTH(TRIM(section)) BETWEEN 1 AND 10),
  -- The term the block belongs to; NULL for a block not tied to a term.
  term_id    INTEGER,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One block per program, major, year, section and term. A missing major or
-- term counts as a value of its own, so "BSIT 4A" with no term cannot be
-- added twice.
CREATE UNIQUE INDEX IF NOT EXISTS blocks_identity_key ON blocks (
  program_id, COALESCE(major_id, 0), year_level, UPPER(TRIM(section)), COALESCE(term_id, 0)
);
CREATE INDEX IF NOT EXISTS idx_blocks_term_id ON blocks (term_id);

ALTER TABLE students ADD COLUMN IF NOT EXISTS program_id INTEGER;
ALTER TABLE students ADD COLUMN IF NOT EXISTS major_id   INTEGER;
ALTER TABLE students ADD COLUMN IF NOT EXISTS block_id   INTEGER;

CREATE INDEX IF NOT EXISTS idx_students_program_id ON students (program_id);
CREATE INDEX IF NOT EXISTS idx_students_block_id   ON students (block_id);

-- The blocks a term's closing switched off, so reopening restores exactly
-- those: the same way terms.closed_student_ids works for students.
ALTER TABLE terms ADD COLUMN IF NOT EXISTS closed_block_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('fk_programs_college',  'programs', 'college_id', 'colleges', 'RESTRICT'),
      ('fk_majors_program',    'majors',   'program_id', 'programs', 'RESTRICT'),
      ('fk_blocks_program',    'blocks',   'program_id', 'programs', 'RESTRICT'),
      ('fk_blocks_major',      'blocks',   'major_id',   'majors',   'SET NULL'),
      ('fk_blocks_term',       'blocks',   'term_id',    'terms',    'SET NULL'),
      ('fk_students_program',  'students', 'program_id', 'programs', 'SET NULL'),
      ('fk_students_major',    'students', 'major_id',   'majors',   'SET NULL'),
      ('fk_students_block',    'students', 'block_id',   'blocks',   'SET NULL')
    ) AS t(name, tbl, col, target, on_delete)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.name) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON UPDATE CASCADE ON DELETE %s NOT VALID',
        fk.tbl, fk.name, fk.col, fk.target, fk.on_delete
      );
    END IF;
  END LOOP;
END $$;

-- Keeps a student's program_id in step with their program text, and their
-- major and block inside that program.
CREATE OR REPLACE FUNCTION link_program_from_text() RETURNS trigger AS $$
DECLARE
  relink BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A new row that names its program outright keeps it.
    relink := NEW.program_id IS NULL;
  ELSE
    -- Only when the text itself changed, and the statement did not also
    -- set the program on purpose.
    relink := NEW.program IS DISTINCT FROM OLD.program
              AND NEW.program_id IS NOT DISTINCT FROM OLD.program_id;
  END IF;

  IF relink THEN
    IF NEW.program IS NULL OR TRIM(NEW.program) = '' THEN
      NEW.program_id := NULL;
    ELSE
      NEW.program_id := (
        SELECT id FROM programs
        WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.program))
           OR LOWER(TRIM(short_code)) = LOWER(TRIM(NEW.program))
        -- The name is looked at first, should a name equal another program's code.
        ORDER BY (LOWER(TRIM(name)) = LOWER(TRIM(NEW.program))) DESC
        LIMIT 1
      );
    END IF;
  END IF;

  -- A major or a block of some other program cannot stay on the student.
  IF NEW.major_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM majors m WHERE m.id = NEW.major_id AND m.program_id = NEW.program_id
  ) THEN
    NEW.major_id := NULL;
  END IF;
  IF NEW.block_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM blocks b WHERE b.id = NEW.block_id AND b.program_id = NEW.program_id
  ) THEN
    NEW.block_id := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_students_link_program ON students;
CREATE TRIGGER trg_students_link_program
  BEFORE INSERT OR UPDATE OF program, program_id, major_id, block_id ON students
  FOR EACH ROW EXECUTE FUNCTION link_program_from_text();
