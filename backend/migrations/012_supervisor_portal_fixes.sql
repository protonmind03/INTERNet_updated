-- 012: links a supervisor's incident report to the intern it is about, and
-- brings evaluation categories saved under the coordinator's old labels in
-- line with the single list both portals now use.

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS reported_student_id VARCHAR(50);

UPDATE evaluations SET category = 'Overall Performance'
WHERE category = 'Overall OJT Performance' AND evaluator_type <> 'student';

UPDATE evaluations SET category = 'Punctuality & Attendance'
WHERE category = 'Attendance & Punctuality' AND evaluator_type <> 'student';
