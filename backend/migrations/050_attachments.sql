-- 050: pictures attached to an entry.
--
-- A student can add up to three pictures to the note they write at
-- time-out, to a weekly report and to a concern; a supervisor can add them
-- to a concern they file. One table holds them all: `owner_type` says what
-- kind of entry ('attendance', 'journal', 'complaint') and `owner_id` which
-- one. The picture itself is kept where every other upload is
-- (services/privateFileStore.ts) and is only ever read back through a route
-- that checks who is asking.
--
-- `student_id` is the student the entry belongs to. It is empty for a
-- concern a supervisor filed, which belongs to no student.
--
-- A picture is never deleted while its entry stands. Taking one off an
-- entry sets `removed_at`; the row and the file stay.
--
-- Width, height and the caption are what the uploader's browser sent; the
-- size and the SHA-256 are worked out by the server from the bytes it
-- received.
--
-- Additive only. The foreign key is NOT VALID.

CREATE TABLE IF NOT EXISTS attachments (
  id               BIGSERIAL PRIMARY KEY,
  owner_type       TEXT NOT NULL CHECK (owner_type IN ('attendance', 'journal', 'complaint')),
  owner_id         INTEGER NOT NULL,
  student_id       VARCHAR(50),
  uploaded_by_role TEXT NOT NULL CHECK (uploaded_by_role IN ('student', 'supervisor')),
  uploaded_by_id   VARCHAR(50) NOT NULL,
  file_path        TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  size_bytes       INTEGER NOT NULL CHECK (size_bytes > 0),
  width            INTEGER,
  height           INTEGER,
  sha256           TEXT NOT NULL,
  caption          TEXT,
  position         SMALLINT NOT NULL DEFAULT 0,
  removed_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_attachments_student ON attachments (student_id) WHERE student_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_attachments_student') THEN
    ALTER TABLE attachments
      ADD CONSTRAINT fk_attachments_student
      FOREIGN KEY (student_id) REFERENCES students(student_id)
      ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;
