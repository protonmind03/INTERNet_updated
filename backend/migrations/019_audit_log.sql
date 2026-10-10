-- 019: a record of who did what.
--
-- One row for each decision or change that affects someone else's record:
-- attendance verified, rejected, undone or acknowledged; a time-in recorded
-- by a supervisor; task, document and absence decisions and their undos;
-- accounts created, edited, activated, deactivated or given a new password;
-- interns moved between supervisors; a complaint's status changed;
-- announcements sent and withdrawn; requirement and schedule changes.
--
-- Rows are only ever added. Nothing in the application edits or deletes
-- them, and the coordinator's page for them is read-only.
--
-- * details  a few plain facts about the action (the new status, a reason),
--            never a password or a file.
-- * ip_hash  a one-way hash of the caller's network address: enough to see
--            that two actions came from the same place, not to learn where.

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_role  TEXT NOT NULL CHECK (actor_role IN ('student', 'supervisor', 'coordinator')),
  actor_id    TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (actor_role, actor_id);
