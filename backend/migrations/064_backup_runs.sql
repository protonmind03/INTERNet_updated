-- 064: every backup run, and every restore drill, on record.
--
-- The nightly database backup runs in a Railway service of its own
-- (backend/src/scripts/backup-cron.ts); the weekly pack of uploaded files
-- runs in the backend while the files are on its volume
-- (services/backups.ts). Each writes a row here when it starts and finishes
-- it when it ends, so the coordinator's status card can say when the last
-- one worked, and a backup that did not happen is visible instead of
-- silent. A restore drill (a person restoring a backup to check it) is a
-- row too, written from the status card.
--
--   kind         'database' | 'uploads' | 'restore_drill'
--   status       'running' | 'ok' | 'failed'. A 'running' row older than a
--                few hours is a run that died without saying so.
--   object_key   where the encrypted file is in the bucket (its name only:
--                never the bucket's address or keys)
--   size_bytes   the encrypted file's size
--   sha256       of the encrypted file, as uploaded
--   detail       a short line for the status card: why it failed (no
--                secrets, no connection strings), or for a drill, what was
--                restored
--   recorded_by  the coordinator who recorded a restore drill
--
-- Additive and safe to run again.

CREATE TABLE IF NOT EXISTS backup_runs (
  id           BIGSERIAL PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('database', 'uploads', 'restore_drill')),
  status       TEXT NOT NULL CHECK (status IN ('running', 'ok', 'failed')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  object_key   TEXT,
  size_bytes   BIGINT,
  sha256       TEXT,
  detail       TEXT,
  recorded_by  VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_backup_runs_kind_started ON backup_runs (kind, started_at DESC);
