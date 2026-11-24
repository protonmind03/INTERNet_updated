-- 087: the monitoring plan (Phase 2.3, November 2026).
--
-- site_visits held only visits already made. A coordinator now plans
-- check-ins too: a visit, a call or a message check-in, for a company or
-- for one student there, on a day. A planned row has no visit date or
-- findings until it is marked done; a done row has both, as before.
--
--   kind          visit | call | message (old rows: visit)
--   status        planned | done (old rows: done)
--   planned_on    the day it is planned for
--   student_id    the student it is about, or NULL for the whole company
--   plan_note     what to look at
--   reminded_at   when the planner was reminded, the day before (once)

ALTER TABLE site_visits ALTER COLUMN visit_date DROP NOT NULL;
ALTER TABLE site_visits ALTER COLUMN findings DROP NOT NULL;
ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'visit';
ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done';
ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS planned_on DATE;
ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS student_id VARCHAR(50) REFERENCES students(student_id) ON DELETE CASCADE;
ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS plan_note TEXT;
ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_visits_kind_check') THEN
    ALTER TABLE site_visits ADD CONSTRAINT site_visits_kind_check CHECK (kind IN ('visit', 'call', 'message'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_visits_status_check') THEN
    ALTER TABLE site_visits ADD CONSTRAINT site_visits_status_check CHECK (
      (status = 'done' AND visit_date IS NOT NULL AND findings IS NOT NULL)
      OR (status = 'planned' AND planned_on IS NOT NULL)
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_site_visits_planned ON site_visits (planned_on) WHERE status = 'planned';
