-- 075: an index under every foreign key that had none (audit, November 2026).
--
-- A foreign key without an index makes two things slow as the data grows:
-- reading the rows that belong to a record (a student's appeals, a group's
-- tasks), and deleting or renaming the record it points to, which has to
-- scan the whole referring table. Twelve of the 61 had none. Indexes only:
-- nothing about the tables, their rows or their rules changes, and each is
-- made only when missing, so running this again does nothing.

CREATE INDEX IF NOT EXISTS idx_attendance_appeals_student_id ON attendance_appeals (student_id);
CREATE INDEX IF NOT EXISTS idx_blocks_major_id ON blocks (major_id);
CREATE INDEX IF NOT EXISTS idx_coordinators_college_id ON coordinators (college_id);
CREATE INDEX IF NOT EXISTS idx_daily_report_entries_student_id ON daily_report_entries (student_id);
CREATE INDEX IF NOT EXISTS idx_documents_reviewed_by_supervisor_id ON documents (reviewed_by_supervisor_id);
CREATE INDEX IF NOT EXISTS idx_dtr_certifications_trainee_signature_id ON dtr_certifications (trainee_signature_id);
CREATE INDEX IF NOT EXISTS idx_offline_vouchers_attendance_id ON offline_vouchers (attendance_id);
CREATE INDEX IF NOT EXISTS idx_offline_vouchers_device_key_id ON offline_vouchers (device_key_id);
CREATE INDEX IF NOT EXISTS idx_students_coordinator_id ON students (coordinator_id);
CREATE INDEX IF NOT EXISTS idx_students_major_id ON students (major_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by_id ON tasks (assigned_by_id);
CREATE INDEX IF NOT EXISTS idx_tasks_task_group_id ON tasks (task_group_id);
