-- 088: hard copies received, and their transmittal (Phase 2.4, November 2026).
--
-- The OJT office still keeps paper. For a student's document or final
-- evaluation, a coordinator records that the hard copy came in: who received
-- it, on what day, a note, and optionally a scan of the transmittal letter
-- that came with it (a private file, like every upload). One row per record;
-- removing it says the hard copy was not received after all.
--
--   record_type   document | final_evaluation
--   record_id     documents.id or final_evaluations.id

CREATE TABLE IF NOT EXISTS hard_copies (
  id                 SERIAL PRIMARY KEY,
  record_type        TEXT NOT NULL CHECK (record_type IN ('document', 'final_evaluation')),
  record_id          INTEGER NOT NULL,
  student_id         VARCHAR(50) NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  received_on        DATE NOT NULL,
  received_by_name   TEXT NOT NULL CHECK (LENGTH(TRIM(received_by_name)) BETWEEN 2 AND 150),
  note               TEXT CHECK (note IS NULL OR LENGTH(note) <= 500),
  scan_path          TEXT,
  scan_name          TEXT,
  scan_type          TEXT,
  recorded_by        VARCHAR(50) NOT NULL,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_type, record_id)
);
CREATE INDEX IF NOT EXISTS idx_hard_copies_student ON hard_copies (student_id);
