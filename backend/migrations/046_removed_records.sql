-- 046: a copy of every record a person removes.
--
-- A few records can be removed for good: a task or a team's task that is
-- cancelled, an evaluation that is removed, an absence notice that is
-- withdrawn, an announcement, a holiday, a time record certification and a
-- site visit. Until now the row was simply gone. From here on the delete
-- copies the whole row into this table first, in the same statement, with
-- who removed it and when. Nothing reads this table in the app: it is the
-- answer to "what did that record say before it was removed".
--
-- `data` is the row as it was. It can hold personal details (a task's
-- title, an evaluation's comments), so it is kept out of the audit page
-- and out of every list. An uploaded file that went with the record is
-- not kept; only its name is, inside `data`.
--
-- Additive only. No foreign keys: the row it describes no longer exists,
-- and the account that removed it may later be deactivated.

CREATE TABLE IF NOT EXISTS removed_records (
  id              BIGSERIAL PRIMARY KEY,
  table_name      TEXT NOT NULL,
  record_id       TEXT NOT NULL,
  student_id      VARCHAR(50),
  data            JSONB NOT NULL,
  removed_by_role TEXT NOT NULL,
  removed_by_id   TEXT NOT NULL,
  removed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_removed_records_record ON removed_records (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_removed_records_student ON removed_records (student_id) WHERE student_id IS NOT NULL;
