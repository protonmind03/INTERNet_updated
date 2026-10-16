-- 053: a running count of what each account has uploaded.
--
-- A student or supervisor may keep only so much on the server
-- (UPLOAD_QUOTA_MB_STUDENT, default 300; UPLOAD_QUOTA_MB_SUPERVISOR,
-- default 200) and send only so many files a day (UPLOAD_DAILY_FILES,
-- default 60). Each file accepted as a document, a task file, a concern's
-- evidence or a picture is written here with its size; the limits are
-- worked out from these rows (services/uploadQuota.ts). Time-in photos are
-- not counted: a time-in must never be refused for running out of room.
--
-- Only the account, the kind of upload, the size and the moment are kept:
-- never the file's name or what is in it.
--
-- Existing rows: the documents and pictures already stored are entered
-- below with their recorded sizes, so a student who has uploaded a lot
-- already starts with that counted. Task files and concern evidence stored
-- before this migration never had their sizes recorded and are not counted.
--
-- Additive and safe to run again: the entries copied in are recognised by
-- their source and id and never copied twice.

CREATE TABLE IF NOT EXISTS upload_ledger (
  id          BIGSERIAL PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('student', 'supervisor')),
  account_id  VARCHAR(50) NOT NULL,
  kind        TEXT NOT NULL,
  bytes       BIGINT NOT NULL CHECK (bytes >= 0),
  source      TEXT,
  source_id   BIGINT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_ledger_account ON upload_ledger (role, account_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS upload_ledger_copied_key
  ON upload_ledger (source, source_id) WHERE source IS NOT NULL;

INSERT INTO upload_ledger (role, account_id, kind, bytes, source, source_id, created_at)
SELECT 'student', d.student_id, 'document', d.size_bytes, 'documents', d.id, d.uploaded_at AT TIME ZONE 'Asia/Manila'
FROM documents d
ON CONFLICT (source, source_id) WHERE source IS NOT NULL DO NOTHING;

INSERT INTO upload_ledger (role, account_id, kind, bytes, source, source_id, created_at)
SELECT a.uploaded_by_role, a.uploaded_by_id, 'picture', a.size_bytes, 'attachments', a.id, a.created_at
FROM attachments a
ON CONFLICT (source, source_id) WHERE source IS NOT NULL DO NOTHING;
