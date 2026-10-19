-- 068: the university's name lines, and each program's formal name, for
-- the Time Record header.
--
--   institution_profile   exactly one row (id 1): the lines printed above
--                         the Daily Time Record, in order. The coordinator
--                         edits them on their Profile (Institution details).
--     republic_line       REPUBLIC OF THE PHILIPPINES
--     university_name     Pangasinan State University
--     campus_name         LINGAYEN CAMPUS
--     locality_line       LINGAYEN, PANGASINAN
--     seal_asset          which seal image the app shows ('psu-seal')
--                         The row is added once; a row already there is kept.
--
--   programs.formal_name  the program's full name ("Bachelor of Science in
--                         Information Technology"), printed under the
--                         college. Existing programs whose short code matches
--                         one of the campus's programs below get it; any
--                         other keeps NULL, and the Time Record prints the
--                         program's own name instead. A formal name already
--                         set is never overwritten.
--
-- Additive and safe to run again.

CREATE TABLE IF NOT EXISTS institution_profile (
  id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  republic_line   TEXT NOT NULL,
  university_name TEXT NOT NULL,
  campus_name     TEXT NOT NULL,
  locality_line   TEXT NOT NULL,
  seal_asset      TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO institution_profile (id, republic_line, university_name, campus_name, locality_line, seal_asset)
VALUES (1, 'REPUBLIC OF THE PHILIPPINES', 'Pangasinan State University', 'LINGAYEN CAMPUS',
        'LINGAYEN, PANGASINAN', 'psu-seal')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE programs ADD COLUMN IF NOT EXISTS formal_name TEXT;

UPDATE programs p SET formal_name = v.formal
FROM (VALUES
  ('ABEL',   'Bachelor of Arts in English Language'),
  ('ABEcon', 'Bachelor of Arts in Economics'),
  ('BSBio',  'Bachelor of Science in Biology'),
  ('BSND',   'Bachelor of Science in Nutrition and Dietetics'),
  ('BSSW',   'Bachelor of Science in Social Work'),
  ('BPA',    'Bachelor of Public Administration'),
  ('BSBA',   'Bachelor of Science in Business Administration'),
  ('BSCS',   'Bachelor of Science in Computer Science'),
  ('BSIT',   'Bachelor of Science in Information Technology'),
  ('BSMath', 'Bachelor of Science in Mathematics'),
  ('BSHM',   'Bachelor of Science in Hospitality Management'),
  ('BSEd',   'Bachelor of Secondary Education'),
  ('BTLEd',  'Bachelor of Technology and Livelihood Education'),
  ('BTVTEd', 'Bachelor of Technical-Vocational Teacher Education'),
  ('BIT',    'Bachelor of Industrial Technology')
) AS v(code, formal)
WHERE LOWER(p.short_code) = LOWER(v.code) AND p.formal_name IS NULL;
