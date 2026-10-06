-- 011: a file the supervisor attaches when assigning a task (a template,
-- a brief, a sample). attachment_file is the private upload path;
-- attachment_name is the name the supervisor's file had, shown to the intern.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachment_file TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachment_name TEXT;
