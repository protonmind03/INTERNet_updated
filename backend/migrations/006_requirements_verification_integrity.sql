-- 006: OJT requirements, attendance verification audit trail, and
-- referential integrity.
--
-- * ojt_requirements: coordinator-managed list of required OJT documents
--   (paper use case "Set OJT Requirements"). Seeded with the list that was
--   previously hard-coded in the API and the student Documents page.
-- * attendance.verified_by / verified_at / review_notes: who confirmed or
--   rejected a log and when (paper ERD Daily_report.verified_by). Review
--   notes are kept separate so a rejection no longer overwrites the
--   student's own note.
-- * complaints.evidence_url is reused for supervisor-filed evidence.
-- * Foreign keys: added NOT VALID so that existing rows are not re-checked
--   (an older database may contain orphaned rows), while every new or
--   updated row is enforced. Run VALIDATE CONSTRAINT later after cleanup.
--
-- This migration is idempotent and safe to re-run.

CREATE TABLE IF NOT EXISTS ojt_requirements (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO ojt_requirements (name, sort_order) VALUES
  ('Endorsement', 1),
  ('Medical', 2),
  ('MOA', 3),
  ('Waiver', 4),
  ('Insurance', 5),
  ('Consent', 6),
  ('OJT Evaluation Form (Supervisor)', 7),
  ('Mid-term Report', 8),
  ('Final Narrative Report', 9)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS verified_by  VARCHAR(50);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS verifier_role VARCHAR(20);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS verified_at  TIMESTAMP;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS review_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_attendance_status_date
  ON attendance(status, date);
CREATE INDEX IF NOT EXISTS idx_ojt_schedule_student_day
  ON ojt_schedule(student_id, day);

CREATE TABLE IF NOT EXISTS login_attempts (
  key_hash     CHAR(64) PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  failures     INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ
);

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('fk_students_supervisor', 'students', 'supervisor_id', 'supervisors', 'supervisor_id', 'SET NULL'),
      ('fk_students_coordinator', 'students', 'coordinator_id', 'coordinators', 'coordinator_id', 'SET NULL'),
      ('fk_attendance_student', 'attendance', 'student_id', 'students', 'student_id', 'CASCADE'),
      ('fk_tasks_student', 'tasks', 'student_id', 'students', 'student_id', 'CASCADE'),
      ('fk_tasks_assigned_by', 'tasks', 'assigned_by_id', 'supervisors', 'supervisor_id', 'SET NULL'),
      ('fk_complaints_student', 'complaints', 'student_id', 'students', 'student_id', 'SET NULL'),
      ('fk_complaints_supervisor', 'complaints', 'filed_by_supervisor_id', 'supervisors', 'supervisor_id', 'SET NULL'),
      ('fk_evaluations_student', 'evaluations', 'student_id', 'students', 'student_id', 'CASCADE'),
      ('fk_notifications_student', 'notifications', 'student_id', 'students', 'student_id', 'CASCADE'),
      ('fk_notifications_supervisor', 'notifications', 'supervisor_id', 'supervisors', 'supervisor_id', 'CASCADE'),
      ('fk_notifications_coordinator', 'notifications', 'coordinator_id', 'coordinators', 'coordinator_id', 'CASCADE'),
      ('fk_ojt_schedule_student', 'ojt_schedule', 'student_id', 'students', 'student_id', 'CASCADE'),
      ('fk_documents_student', 'documents', 'student_id', 'students', 'student_id', 'CASCADE'),
      ('fk_documents_reviewer', 'documents', 'reviewed_by_supervisor_id', 'supervisors', 'supervisor_id', 'SET NULL'),
      ('fk_task_reminders_task', 'task_deadline_reminders', 'task_id', 'tasks', 'id', 'CASCADE')
    ) AS t(name, tbl, col, ref_tbl, ref_col, on_delete)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.name) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(%I) ON UPDATE CASCADE ON DELETE %s NOT VALID',
        fk.tbl, fk.name, fk.col, fk.ref_tbl, fk.ref_col, fk.on_delete
      );
    END IF;
  END LOOP;
END $$;
