-- 040: the tasks a student worked on, by day.
--
-- At time-out a student may say which of their tasks they worked on that
-- day. One row links one attendance log to one task. It is extra to the
-- accomplishment note, which stays required: the note says what was done
-- in the student's words, the links say which assigned work it belongs to.
--
-- Additive only. Both foreign keys are NOT VALID, and a link goes when its
-- log or its task does. Older code that knows nothing of this table keeps
-- working: a time-out with no tasks chosen writes no rows.

CREATE TABLE IF NOT EXISTS attendance_tasks (
  attendance_id INTEGER NOT NULL,
  task_id       INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attendance_id, task_id)
);

-- "Which days was this task worked on" reads the other way round.
CREATE INDEX IF NOT EXISTS idx_attendance_tasks_task_id ON attendance_tasks (task_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_attendance_tasks_attendance') THEN
    ALTER TABLE attendance_tasks
      ADD CONSTRAINT fk_attendance_tasks_attendance
      FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_attendance_tasks_task') THEN
    ALTER TABLE attendance_tasks
      ADD CONSTRAINT fk_attendance_tasks_task
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
