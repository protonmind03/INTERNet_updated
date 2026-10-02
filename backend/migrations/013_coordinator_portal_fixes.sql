-- 013: lets the coordinator settle a rejected attendance log (so a correct
-- rejection stops being listed as a problem), and lets an announcement be
-- sent to one company instead of everyone.

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS flag_acknowledged_at TIMESTAMP;

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS company TEXT;
