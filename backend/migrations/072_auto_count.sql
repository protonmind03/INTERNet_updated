-- 072: clean days count on their own (2026-10-27).
--
-- A trainee's time-in that passed the camera check and ended normally
-- (timed out, nothing offline, corrected, re-photographed or flagged) is
-- verified by the system two working days after the day, unless the
-- supervisor rejects or decides it first. Anything unusual still waits for
-- the supervisor, as before. services/autoCount.ts says which logs are
-- clean and runs the round that counts them.
--
--   attendance.auto_counted   TRUE on a log the system verified this way
--                             (verifier_role 'system', verified_by NULL).
--   auto_count_on(day)        the second working day after `day`: Monday to
--                             Friday, not a holiday. A clean log counts once
--                             that day is over.

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS auto_counted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION auto_count_on(day DATE) RETURNS DATE
LANGUAGE plpgsql STABLE AS $$
DECLARE
  d DATE := day;
  found INTEGER := 0;
BEGIN
  IF day IS NULL THEN
    RETURN NULL;
  END IF;
  WHILE found < 2 LOOP
    d := d + 1;
    IF EXTRACT(ISODOW FROM d) < 6 AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.holiday_date = d) THEN
      found := found + 1;
    END IF;
  END LOOP;
  RETURN d;
END;
$$;

-- The round looks for pending logs; most logs are decided, so the index stays small.
CREATE INDEX IF NOT EXISTS idx_attendance_pending_date ON attendance (date) WHERE status = 'Pending';
