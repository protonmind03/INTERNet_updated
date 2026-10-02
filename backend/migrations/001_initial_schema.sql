-- Initial schema for a new local INTERNet prototype database.
--
-- This schema is derived from the columns queried by backend/src/server.ts.
-- It is intended for fresh databases, not as a replacement for an existing
-- deployment's original schema. Apply migrations in numeric order.
--
-- No foreign keys are added because the existing API treats public IDs as
-- strings and its legacy relationship/deletion rules are not documented.

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(150) NOT NULL,
  program TEXT,
  company TEXT,
  supervisor_id VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS supervisors (
  id SERIAL PRIMARY KEY,
  supervisor_id VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(150) NOT NULL,
  company TEXT,
  department TEXT
);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  time_in TIMESTAMP NOT NULL,
  break_time TIMESTAMP,
  break_end_time TIMESTAMP,
  time_out TIMESTAMP,
  hours NUMERIC(8, 2),
  note TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'Pending',
  image_url VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_by TEXT,
  priority VARCHAR(32) NOT NULL DEFAULT 'Medium',
  status VARCHAR(32) NOT NULL DEFAULT 'Pending',
  due_date DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS complaints (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50),
  report_type VARCHAR(32) NOT NULL,
  reported_student_name TEXT,
  reported_program_section TEXT,
  supervisor_name TEXT,
  company_name TEXT,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_url VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ojt_schedule (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  day VARCHAR(20) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  focus TEXT,
  hours NUMERIC(5, 2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_attendance_student_date
  ON attendance(student_id, date);
CREATE INDEX IF NOT EXISTS idx_tasks_student_due_date
  ON tasks(student_id, due_date);
CREATE INDEX IF NOT EXISTS idx_complaints_student_created
  ON complaints(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_student_created
  ON notifications(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ojt_schedule_student_active
  ON ojt_schedule(student_id, is_active);
