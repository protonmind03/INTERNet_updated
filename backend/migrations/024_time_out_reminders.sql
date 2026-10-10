-- 024: the "did you forget to time out?" reminder.
--
-- One row per student per day a reminder was sent, so nobody is reminded
-- twice for the same day however often the check runs. `scheduled_end` is
-- the end of the shift the reminder was worked out from.

CREATE TABLE IF NOT EXISTS time_out_reminders (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  reminder_date DATE NOT NULL,
  attendance_id INTEGER,
  scheduled_end TIME,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_time_out_reminders_student_date
  ON time_out_reminders (student_id, reminder_date);
