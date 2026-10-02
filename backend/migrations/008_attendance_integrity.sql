-- 008: one attendance log per student per day, and rendered hours that
-- exclude break time.

-- The unique index cannot be built while duplicate days exist. Stop with a
-- clear message instead of deleting attendance data automatically.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM attendance
    GROUP BY student_id, date
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'attendance has more than one log for the same student and date. Remove the duplicate rows, then run the migration again. Find them with: SELECT student_id, date, COUNT(*) FROM attendance GROUP BY 1, 2 HAVING COUNT(*) > 1';
  END IF;
END $$;

-- Makes a double-tap or retried time-in impossible at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_student_date
  ON attendance(student_id, date);

-- Earlier logs stored time-out minus time-in without removing the break.
-- Recompute completed logs that recorded a break so all totals follow the
-- same rule. A break that was never ended counts until time-out.
UPDATE attendance
SET hours = GREATEST(
  ROUND(
    (
      (
        EXTRACT(EPOCH FROM (time_out - time_in))
        - EXTRACT(EPOCH FROM (COALESCE(break_end_time, time_out) - break_time))
      ) / 3600.0
    )::numeric,
    2
  ),
  0
)
WHERE time_in IS NOT NULL
  AND time_out IS NOT NULL
  AND break_time IS NOT NULL;
