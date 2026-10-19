-- 067: the trainee's signature, for the Time Record.
--
-- The trainee draws their signature once (Profile, Signature) and it is
-- printed above "Signature over printed name of the trainee" on their
-- Daily Time Record. It is an image of their handwriting, not a
-- cryptographic signature.
--
--   student_signatures   one row per signature drawn or uploaded.
--     file_path          the PNG (600 x 200, transparent), kept through
--                        services/privateFileStore.ts like every other
--                        private upload
--     svg_paths          the stroke paths, so print can draw it crisply; an
--                        uploaded image has none (empty text)
--     sha256             of the PNG
--     width, height      of the PNG, in pixels
--     revoked_at         set when it is replaced or removed. At most one
--                        signature per trainee is not revoked (the index).
--
--   dtr_certifications.trainee_signature_id
--                        the signature that was active when the supervisor
--                        certified the month, so a certified month keeps
--                        the signature it was certified with. Existing rows
--                        get NULL: those months print no signature image.
--
-- Foreign keys are added NOT VALID, as in 049 onward.
--
-- Additive and safe to run again.

CREATE TABLE IF NOT EXISTS student_signatures (
  id          SERIAL PRIMARY KEY,
  student_id  VARCHAR(50) NOT NULL,
  file_path   TEXT NOT NULL,
  svg_paths   TEXT NOT NULL,
  sha256      TEXT NOT NULL,
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_signatures_active
  ON student_signatures (student_id) WHERE revoked_at IS NULL;

ALTER TABLE dtr_certifications ADD COLUMN IF NOT EXISTS trainee_signature_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_student_signatures_student') THEN
    ALTER TABLE student_signatures
      ADD CONSTRAINT fk_student_signatures_student
      FOREIGN KEY (student_id) REFERENCES students(student_id)
      ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dtr_certifications_trainee_signature') THEN
    ALTER TABLE dtr_certifications
      ADD CONSTRAINT fk_dtr_certifications_trainee_signature
      FOREIGN KEY (trainee_signature_id) REFERENCES student_signatures(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
