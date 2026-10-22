-- 071: the PSU marks (internet-revisions, Section 2).
--
-- Each college, program and major can name the mark the app shows for it:
-- a key into the shipped set (my-pwa/public/brand/psu, listed in
-- my-pwa/src/brand/psuMarks.ts), never a file someone uploaded. Programs
-- and majors also carry the name of their student organisation, which is
-- whose logo the mark is.
--
--   colleges.mark_key   'college-ccs'          the college seal
--   programs.mark_key   'org-bsit-sfiti'       the program's organisation
--   programs.org_name   'Society of Future I.T. Innovators (SFITI)'
--   majors.mark_key     'org-bsed-english-afet'
--   majors.org_name     'Association of Future English Teachers (AFET)'
--
-- The seed matches by short name, short code and major name, ignoring case
-- and outer spaces, and fills only what is still empty: a coordinator's
-- choice on the Programs page is never overwritten. CHTM's logo spells the
-- college CTHM; the system's short name is CHTM, so that is what is matched.
--
-- Left out on purpose:
--   * the ABEcon organisation (ECOSOC): the logo supplied belongs to another
--     university, so it is not seeded and ABEcon shows its monogram until
--     the OJT office supplies the right one;
--   * CBPA has no college seal yet (MISSING_ASSETS.md);
--   * BSEd Mathematics is unconfirmed, so it is not added as a major.
--
-- The four BSEd majors whose organisations sent logos are added if they
-- are not there yet. Additive and safe to run twice.

ALTER TABLE colleges ADD COLUMN IF NOT EXISTS mark_key TEXT
  CHECK (mark_key IS NULL OR mark_key ~ '^[a-z0-9-]{2,60}$');
ALTER TABLE programs ADD COLUMN IF NOT EXISTS mark_key TEXT
  CHECK (mark_key IS NULL OR mark_key ~ '^[a-z0-9-]{2,60}$');
ALTER TABLE programs ADD COLUMN IF NOT EXISTS org_name TEXT
  CHECK (org_name IS NULL OR LENGTH(TRIM(org_name)) BETWEEN 2 AND 200);
ALTER TABLE majors ADD COLUMN IF NOT EXISTS mark_key TEXT
  CHECK (mark_key IS NULL OR mark_key ~ '^[a-z0-9-]{2,60}$');
ALTER TABLE majors ADD COLUMN IF NOT EXISTS org_name TEXT
  CHECK (org_name IS NULL OR LENGTH(TRIM(org_name)) BETWEEN 2 AND 200);

-- College seals.
UPDATE colleges c
SET mark_key = seed.mark_key, updated_at = NOW()
FROM (VALUES
  ('CASL', 'college-casl'),
  ('CCS',  'college-ccs'),
  ('CTE',  'college-cte'),
  ('CIT',  'college-cit'),
  ('CHTM', 'college-chtm')
) AS seed(short_name, mark_key)
WHERE LOWER(TRIM(c.short_name)) = LOWER(seed.short_name)
  AND c.mark_key IS NULL;

-- Program organisations.
UPDATE programs p
SET mark_key = COALESCE(p.mark_key, seed.mark_key),
    org_name = COALESCE(p.org_name, seed.org_name),
    updated_at = NOW()
FROM (VALUES
  ('ABEL',   'org-abel-lg',      'Linguists'' Guild (LG)'),
  ('BSBio',  'org-bsbio-safb',   'Student Alliance of Future Biologists (SAFB)'),
  ('BSND',   'org-bsnd-fndc',    'Future Nutritionist-Dietitians Club (FNDC)'),
  ('BSSW',   'org-bssw-jswap',   'Junior Social Workers'' Association of the Philippines, PSU chapter (JSWAP)'),
  ('BSBA',   'org-bsba-jbma',    'Junior Business Managers'' Association (JBMA)'),
  ('BPA',    'org-bpa-ypag',     'Young Public Administrators'' Guild (YPAG)'),
  ('BSCS',   'org-bscs-clics',   'Campus League of Ingenious Computer Science Students (CLICS)'),
  ('BSMath', 'org-bsmath-mc',    'Math Circle (MC)'),
  ('BSIT',   'org-bsit-sfiti',   'Society of Future I.T. Innovators (SFITI)'),
  ('BIT',    'org-bit-aits',     'Association of Industrial Technology Students (AITS)'),
  ('BTVTEd', 'org-btvted-attes', 'Association of TechVoc Teacher Education Students (ATTES)'),
  ('BTLEd',  'org-btled-ofttle', 'Organization of Future Teachers of Technology and Livelihood Education (OFTTLE)'),
  ('BSHM',   'org-bshm-frhc',    'Future Restaurateur and Hotelier Club (FRHC)')
) AS seed(short_code, mark_key, org_name)
WHERE LOWER(TRIM(p.short_code)) = LOWER(seed.short_code)
  AND (p.mark_key IS NULL OR p.org_name IS NULL);

-- The BSEd majors the logos show.
INSERT INTO majors (program_id, name)
SELECT p.id, seed.name
FROM (VALUES ('English'), ('Filipino'), ('Science'), ('Social Studies')) AS seed(name)
JOIN programs p ON LOWER(TRIM(p.short_code)) = 'bsed'
ON CONFLICT DO NOTHING;

-- Their organisations.
UPDATE majors m
SET mark_key = COALESCE(m.mark_key, seed.mark_key),
    org_name = COALESCE(m.org_name, seed.org_name),
    updated_at = NOW()
FROM (VALUES
  ('English',        'org-bsed-english-afet',    'Association of Future English Teachers (AFET)'),
  ('Filipino',       'org-bsed-filipino-kamfil', 'KAMFIL'),
  ('Science',        'org-bsed-science-ec',      'Environmentalists Club (EC)'),
  ('Social Studies', 'org-bsed-socstud-kmap',    'KMAP')
) AS seed(major, mark_key, org_name), programs p
WHERE m.program_id = p.id
  AND LOWER(TRIM(p.short_code)) = 'bsed'
  AND LOWER(TRIM(m.name)) = LOWER(seed.major)
  AND (m.mark_key IS NULL OR m.org_name IS NULL);
