-- 031: the structured final evaluation.
--
-- evaluation_forms holds the form the supervisor fills in at the end of
-- the OJT: a list of criteria and the top of the rating scale. Saving a
-- changed form adds a row and retires the old one, so an evaluation
-- already submitted keeps the form it was written on.
--
-- final_evaluations holds one evaluation per student: a rating for every
-- criterion, the average, and written remarks. `form_snapshot` is the
-- criteria and scale as they were when it was submitted.
--
-- The first form is a SAMPLE (is_sample = TRUE) so the feature can be
-- tried. It is not the university's form; the coordinator replaces it.

CREATE TABLE IF NOT EXISTS evaluation_forms (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  scale_max INTEGER NOT NULL DEFAULT 5,
  criteria JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_sample BOOLEAN NOT NULL DEFAULT FALSE,
  created_by VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS final_evaluations (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  form_id INTEGER NOT NULL,
  form_snapshot JSONB NOT NULL,
  supervisor_id VARCHAR(50) NOT NULL,
  supervisor_name TEXT NOT NULL,
  ratings JSONB NOT NULL,
  average NUMERIC(5,2) NOT NULL,
  remarks TEXT NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_final_evaluations_student
  ON final_evaluations (student_id);

INSERT INTO evaluation_forms (name, scale_max, criteria, is_active, is_sample)
SELECT 'Sample final evaluation', 5,
  '[
    {"key": "c1", "label": "Quality of work", "description": "Accuracy, neatness and completeness of what was produced."},
    {"key": "c2", "label": "Productivity", "description": "Amount of work finished, and finished on time."},
    {"key": "c3", "label": "Attendance and punctuality", "description": "Reports on the days and at the hours agreed."},
    {"key": "c4", "label": "Initiative", "description": "Looks for work and solves problems without being told."},
    {"key": "c5", "label": "Teamwork and communication", "description": "Works well with others; speaks and writes clearly."},
    {"key": "c6", "label": "Professional conduct", "description": "Follows company rules; is courteous and dependable."},
    {"key": "c7", "label": "Technical knowledge", "description": "Applies what the program taught to the work given."}
  ]'::jsonb,
  TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM evaluation_forms);
