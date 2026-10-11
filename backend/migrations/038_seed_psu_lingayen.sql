-- 038: the colleges, programs and majors of PSU Lingayen.
--
-- A starting list, so the pickers are not empty on the first day. It is the
-- list the group was given; the OJT office has yet to confirm it. Do not
-- correct it by editing this file: a migration runs once and is then
-- history. Corrections are made by a coordinator on the Programs page,
-- which can rename, add and deactivate every row here.
--
-- Every insert is ON CONFLICT DO NOTHING, so running it where some of these
-- already exist (by name, or by short code for a program) leaves those
-- untouched. OJT applies to every program until a coordinator says
-- otherwise. No blocks are seeded: they belong to a term and are made on
-- the Programs page.

INSERT INTO colleges (name, short_name) VALUES
  ('College of Arts, Sciences, and Letters',       'CASL'),
  ('College of Business and Public Administration', 'CBPA'),
  ('College of Computing Sciences',                 'CCS'),
  ('College of Hospitality and Tourism Management', 'CHTM'),
  ('College of Teacher Education',                  'CTE'),
  ('College of Industrial Technology',              'CIT')
ON CONFLICT DO NOTHING;

INSERT INTO programs (college_id, name, short_code)
SELECT c.id, seed.name, seed.short_code
FROM (VALUES
  ('College of Arts, Sciences, and Letters',        'BA English Language',                                 'ABEL'),
  ('College of Arts, Sciences, and Letters',        'BA Economics',                                        'ABEcon'),
  ('College of Arts, Sciences, and Letters',        'BS Biology',                                          'BSBio'),
  ('College of Arts, Sciences, and Letters',        'BS Nutrition and Dietetics',                          'BSND'),
  ('College of Arts, Sciences, and Letters',        'BS Social Work',                                      'BSSW'),
  ('College of Business and Public Administration', 'Bachelor of Public Administration',                   'BPA'),
  ('College of Business and Public Administration', 'BS Business Administration',                          'BSBA'),
  ('College of Computing Sciences',                 'BS Computer Science',                                 'BSCS'),
  ('College of Computing Sciences',                 'BS Information Technology',                           'BSIT'),
  ('College of Computing Sciences',                 'BS Mathematics',                                      'BSMath'),
  ('College of Hospitality and Tourism Management', 'BS Hospitality Management',                           'BSHM'),
  ('College of Teacher Education',                  'Bachelor of Secondary Education',                     'BSEd'),
  ('College of Teacher Education',                  'Bachelor of Technology and Livelihood Education',     'BTLEd'),
  ('College of Teacher Education',                  'Bachelor of Technical-Vocational Teacher Education',  'BTVTEd'),
  ('College of Industrial Technology',              'Bachelor of Industrial Technology',                   'BIT')
) AS seed(college, name, short_code)
JOIN colleges c ON LOWER(TRIM(c.name)) = LOWER(TRIM(seed.college))
ON CONFLICT DO NOTHING;

-- Majors and specializations, as listed.
INSERT INTO majors (program_id, name)
SELECT p.id, seed.name
FROM (VALUES
  ('BS Business Administration',        'Financial Management'),
  ('BS Business Administration',        'Operations Management'),
  ('BS Mathematics',                    'Pure Mathematics'),
  ('BS Mathematics',                    'Statistics'),
  ('BS Mathematics',                    'CIT'),
  ('Bachelor of Industrial Technology', 'Automotive'),
  ('Bachelor of Industrial Technology', 'Ceramics'),
  ('Bachelor of Industrial Technology', 'Civil'),
  ('Bachelor of Industrial Technology', 'Drafting'),
  ('Bachelor of Industrial Technology', 'Electrical'),
  ('Bachelor of Industrial Technology', 'Electronics'),
  ('Bachelor of Industrial Technology', 'Food Service Management'),
  ('Bachelor of Industrial Technology', 'Garments Fashion and Design'),
  ('Bachelor of Industrial Technology', 'Mechanical')
) AS seed(program, name)
JOIN programs p ON LOWER(TRIM(p.name)) = LOWER(TRIM(seed.program))
ON CONFLICT DO NOTHING;
