-- 041: tasks released on a later day, and tasks given to a team.
--
-- RELEASE DATE. A supervisor can prepare a task ahead and have it appear
-- on a chosen day. tasks.available_from is that day; NULL means "now",
-- which is what every task was until today. An intern never sees a task
-- before its day. When the day comes the reminder loop tells the intern
-- once; tasks.released_notified_at is how it knows it already has, so a
-- restart of the server cannot tell them twice.
--
-- TEAMS. A supervisor can name a group of their interns and give the group
-- one task. The task is stored as ONE ROW PER MEMBER, so everything that
-- already works per student (notifications, reminders, the completion
-- checklist, reviews, the audit log) keeps working untouched. The rows of
-- one team task share tasks.group_task_id; tasks.task_group_id says which
-- team it was given to, for as long as that team exists.
--
--   task_groups         a named team of one supervisor's interns
--   task_group_members  who is in it
--
-- Additive only. Every new column is nullable, so older code keeps
-- working: a task with none of them is an ordinary task, as before. New
-- foreign keys are NOT VALID.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS available_from DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS released_notified_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS group_task_id INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_group_id INTEGER;

-- The numbers that tie a team task's rows together.
CREATE SEQUENCE IF NOT EXISTS tasks_group_task_id_seq;

CREATE INDEX IF NOT EXISTS idx_tasks_group_task_id ON tasks (group_task_id) WHERE group_task_id IS NOT NULL;
-- The release loop looks only at tasks that have a day and have not been announced.
CREATE INDEX IF NOT EXISTS idx_tasks_unreleased ON tasks (available_from)
  WHERE available_from IS NOT NULL AND released_notified_at IS NULL;

CREATE TABLE IF NOT EXISTS task_groups (
  id            SERIAL PRIMARY KEY,
  supervisor_id VARCHAR(50) NOT NULL,
  name          TEXT NOT NULL CHECK (LENGTH(TRIM(name)) BETWEEN 2 AND 80),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A supervisor's teams have different names, whatever the capitals.
CREATE UNIQUE INDEX IF NOT EXISTS task_groups_supervisor_name_key
  ON task_groups (supervisor_id, LOWER(TRIM(name)));

CREATE TABLE IF NOT EXISTS task_group_members (
  group_id   INTEGER NOT NULL,
  student_id VARCHAR(50) NOT NULL,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_task_group_members_student ON task_group_members (student_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_task_group_members_group') THEN
    ALTER TABLE task_group_members
      ADD CONSTRAINT fk_task_group_members_group
      FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE NOT VALID;
  END IF;
  -- Removing a team leaves the tasks it was given; they only forget which team.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_task_group') THEN
    ALTER TABLE tasks
      ADD CONSTRAINT fk_tasks_task_group
      FOREIGN KEY (task_group_id) REFERENCES task_groups(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
