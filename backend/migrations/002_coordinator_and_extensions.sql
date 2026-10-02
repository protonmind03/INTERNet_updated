-- =====================================================================
-- MIGRATION 002 — Coordinator role, task workflow, evaluations,
-- complaint resolution, account status, notification fan-out.
--
-- Safe to run against the existing INTERNet database: every statement
-- is idempotent (IF NOT EXISTS / ON CONFLICT), so running it twice by
-- accident will not error out or duplicate data.
--
-- Run with:
--   psql "$DATABASE_PUBLIC_URL" -f migrations/002_coordinator_and_extensions.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- COORDINATORS
-- ---------------------------------------------------------------------
-- The role that was completely missing from the system. Coordinators
-- get their own login, their own portal, and oversee every student and
-- supervisor in the system.

CREATE TABLE IF NOT EXISTS coordinators (
  id             SERIAL PRIMARY KEY,
  coordinator_id VARCHAR(50) UNIQUE NOT NULL,
  email          VARCHAR(150) UNIQUE NOT NULL,
  password       VARCHAR(255) NOT NULL,
  name           VARCHAR(150) NOT NULL,
  department     VARCHAR(150),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed one coordinator account so there is a way to log in for the
-- first time. Change this password immediately after first login —
-- it is stored hashed (bcrypt) by the seed below, NOT in plain text.
-- Default login: coordinator@internet.psu.edu.ph / Coordinator123!
-- (hash generated for "Coordinator123!")
INSERT INTO coordinators (coordinator_id, email, password, name, department)
VALUES (
  'COORD-0001',
  'coordinator@internet.psu.edu.ph',
  '$2b$10$dj4vBZz0AoFZhj4bIR6nJ.K/boFkQDbpy2I4YHQStjbxSduxqBiEa',
  'OJT Coordinator',
  'College of Computing Sciences'
)
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------
-- ACCOUNT STATUS (for User Management / Edit-Deactivate Account)
-- ---------------------------------------------------------------------

ALTER TABLE students    ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE supervisors ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT TRUE;

-- Bcrypt hashes are ~60 characters. If these columns were originally sized
-- for short plain-text passwords (e.g. VARCHAR(20)), widen them now so
-- new hashed passwords don't get truncated or rejected on insert.
ALTER TABLE students    ALTER COLUMN password TYPE VARCHAR(255);
ALTER TABLE supervisors ALTER COLUMN password TYPE VARCHAR(255);

-- Each student's own required-hours target instead of the hardcoded
-- 180 that used to live in application code.
ALTER TABLE students ADD COLUMN IF NOT EXISTS required_hours INTEGER NOT NULL DEFAULT 180;

-- Which coordinator manages this student, matching the ERD's
-- student_profile.teacher_id relationship (nullable — coordinators can
-- see everyone, this is for reporting/filtering only).
ALTER TABLE students ADD COLUMN IF NOT EXISTS coordinator_id VARCHAR(50);

-- ---------------------------------------------------------------------
-- TASK ASSIGNMENT & SUBMISSION (Feature 12)
-- ---------------------------------------------------------------------
-- The frontend already had a "Submitted" status in its types, but
-- nothing in the backend ever wrote a submission. These columns close
-- that gap so a student's submitted work actually reflects everywhere
-- (student task list, supervisor review queue, coordinator oversight).

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_by_id    VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS submission_notes  TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS submission_file   VARCHAR(255);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS submitted_at      TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewed_at       TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_notes      TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_rating     INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_at        TIMESTAMP NOT NULL DEFAULT NOW();

-- ---------------------------------------------------------------------
-- EVALUATION & FEEDBACK (Feature 10)
-- ---------------------------------------------------------------------
-- Two-way assessment: supervisors rate students, students rate their
-- training experience, teachers can review both.

CREATE TABLE IF NOT EXISTS evaluations (
  id             SERIAL PRIMARY KEY,
  student_id     VARCHAR(50) NOT NULL,
  evaluator_type VARCHAR(20) NOT NULL CHECK (evaluator_type IN ('supervisor', 'student', 'teacher')),
  evaluator_id   VARCHAR(50) NOT NULL,
  evaluator_name VARCHAR(150),
  category       VARCHAR(100) NOT NULL DEFAULT 'Overall Performance',
  rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comments       TEXT,
  eval_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_student ON evaluations(student_id);

-- ---------------------------------------------------------------------
-- COMPLAINT & INCIDENT RESOLUTION (Feature 5)
-- ---------------------------------------------------------------------
-- Complaints could be filed but never resolved — there was no column
-- to record who resolved it, with what notes, or when.

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolved_by      VARCHAR(150);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolved_at      TIMESTAMP;

-- ---------------------------------------------------------------------
-- NOTIFICATION FAN-OUT
-- ---------------------------------------------------------------------
-- Notifications used to only ever be readable by a student — there was
-- no way to notify a supervisor or coordinator. student_id becomes
-- nullable and two new recipient columns are added; exactly one of the
-- three should be set per row.

ALTER TABLE notifications ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS supervisor_id  VARCHAR(50);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS coordinator_id VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_notifications_supervisor  ON notifications(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_notifications_coordinator ON notifications(coordinator_id);

-- ---------------------------------------------------------------------
-- Helpful indexes for the new coordinator dashboard/search queries
-- ---------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_students_supervisor    ON students(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_students_company        ON students(company);
CREATE INDEX IF NOT EXISTS idx_tasks_student           ON tasks(student_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status            ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_complaints_status       ON complaints(status);
