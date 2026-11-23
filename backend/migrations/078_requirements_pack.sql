-- 078: the requirements pack: medical, clearances and IDs (Phase 1.1, November 2026).
--
-- PSU Lingayen asks for medical results and clearances before a student
-- is deployed. This adds what the system needs to ask for them, target
-- them, and keep them private:
--
--   students.sex              optional; used only to target a requirement
--                             (the pregnancy test). Explained in the
--                             privacy notice.
--   students.sss_number,      optional, advised for employment after OJT.
--   students.pagibig_number   Checked in form only by the API.
--
--   ojt_requirements.category        general (as before), medical,
--                                    clearance or academic
--   ojt_requirements.restricted      health and clearance documents: seen
--                                    by the student, the coordinators and
--                                    the director only; never by a
--                                    supervisor, never in the album, a
--                                    preview or a ZIP unless asked for.
--                                    A restricted requirement is always
--                                    reviewed by the coordinator.
--   ojt_requirements.pre_deployment  must be approved before the student is
--                                    cleared for deployment (migration 079).
--
--   applies_to gains a "sex" key, as in {"sex": ["female"]}: a student of
--   one of the listed sexes, on top of the program and block lists.
--
-- The seeded items are added only when no requirement has that name, so a
-- coordinator's own item of the same name is left as it is. The old
-- generic "Medical" item is made inactive (its files are kept) and, being
-- health information, restricted: from now on only the coordinator
-- reviews and sees those files.
--
-- Every new column defaults to what was true before.

ALTER TABLE students ADD COLUMN IF NOT EXISTS sex TEXT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS sss_number TEXT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS pagibig_number TEXT NULL;

ALTER TABLE ojt_requirements ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE ojt_requirements ADD COLUMN IF NOT EXISTS restricted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ojt_requirements ADD COLUMN IF NOT EXISTS pre_deployment BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_sex_check') THEN
    ALTER TABLE students ADD CONSTRAINT students_sex_check CHECK (sex IS NULL OR sex IN ('female', 'male'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ojt_requirements_category_check') THEN
    ALTER TABLE ojt_requirements ADD CONSTRAINT ojt_requirements_category_check
      CHECK (category IN ('general', 'medical', 'clearance', 'academic'));
  END IF;
END
$$;

-- The old generic item: inactive and restricted, reviewed by the coordinator.
UPDATE ojt_requirements
SET is_active = FALSE, restricted = TRUE, category = 'medical', reviewer_role = 'coordinator', updated_at = NOW()
WHERE name = 'Medical';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ojt_requirements_restricted_reviewer_check') THEN
    ALTER TABLE ojt_requirements ADD CONSTRAINT ojt_requirements_restricted_reviewer_check
      CHECK (NOT restricted OR reviewer_role = 'coordinator');
  END IF;
END
$$;

-- The pack. Every item must be approved before deployment.
INSERT INTO ojt_requirements
  (name, description, sort_order, is_active, category, restricted, pre_deployment, reviewer_role, applies_to)
VALUES
  ('Medical examination', 'Result of a general medical examination.', 20, TRUE, 'medical', TRUE, TRUE, 'coordinator', '{}'::jsonb),
  ('Urinalysis', 'Laboratory result.', 21, TRUE, 'medical', TRUE, TRUE, 'coordinator', '{}'::jsonb),
  ('Chest X-ray', 'Result and reading.', 22, TRUE, 'medical', TRUE, TRUE, 'coordinator', '{}'::jsonb),
  ('CBC', 'Complete blood count, laboratory result.', 23, TRUE, 'medical', TRUE, TRUE, 'coordinator', '{}'::jsonb),
  ('Pregnancy test', 'Laboratory result. Asked of female students only.', 24, TRUE, 'medical', TRUE, TRUE, 'coordinator', '{"sex": ["female"]}'::jsonb),
  ('NBI clearance', 'A valid NBI clearance.', 30, TRUE, 'clearance', TRUE, TRUE, 'coordinator', '{}'::jsonb),
  ('Police clearance', 'A valid police clearance.', 31, TRUE, 'clearance', TRUE, TRUE, 'coordinator', '{}'::jsonb),
  ('Barangay clearance', 'A clearance from your barangay.', 32, TRUE, 'clearance', TRUE, TRUE, 'coordinator', '{}'::jsonb),
  ('Certification of Units Earned', 'FM-AA-INT-02, from the Registrar.', 40, TRUE, 'academic', FALSE, TRUE, 'coordinator', '{}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Anti-hepatitis: the food-related programs (majors cannot be targeted, so
-- all of BIT). Added only when one of them exists, since an empty program
-- list would ask it of everyone.
INSERT INTO ojt_requirements
  (name, description, sort_order, is_active, category, restricted, pre_deployment, reviewer_role, applies_to)
SELECT 'Anti-hepatitis vaccination', 'Proof of anti-hepatitis vaccination. Food-related programs.', 25, TRUE,
       'medical', TRUE, TRUE, 'coordinator',
       jsonb_build_object('program_ids', jsonb_agg(p.id ORDER BY p.id))
FROM programs p
WHERE p.short_code IN ('BSHM', 'BTVTEd', 'BIT', 'BSND')
HAVING COUNT(*) > 0
ON CONFLICT (name) DO NOTHING;
