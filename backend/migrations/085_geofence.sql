-- 085: an optional geofence at time-in, by distance only (Phase 2.1, November 2026).
--
-- A company may have a point and a radius (companies.latitude, longitude,
-- radius_m, 200 m unless set). When the OJT rule geofence_mode is not 'off'
-- (ojt_settings; off unless the office turns it on), the phone asks for its
-- location once at time-in. The server keeps only how far it was from the
-- company's point, rounded to 10 m, and whether that is inside the radius:
-- never the coordinates.
--
--   attendance.geo_status       inside, outside, denied (the trainee said
--                               no), unavailable (no fix), no_fence (the
--                               company has no point); NULL when the rule
--                               was off
--   attendance.geo_distance_m   metres, rounded to 10; NULL unless measured
--   attendance.geo_source       server (worked out from the phone's fix) or
--                               phone (an offline time-in, worked out on the
--                               phone and only reported)
--   attendance.geo_needs_review the rule is review_outside and the time-in
--                               was outside, denied or unavailable: the day
--                               waits for the supervisor instead of counting
--                               by itself. A time-in is never refused for it.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS radius_m INTEGER NOT NULL DEFAULT 200;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_geofence_check') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_geofence_check CHECK (
      ((latitude IS NULL) = (longitude IS NULL))
      AND (latitude IS NULL OR latitude BETWEEN -90 AND 90)
      AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)
      AND radius_m BETWEEN 20 AND 5000
    );
  END IF;
END $$;

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS geo_status TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS geo_distance_m INTEGER;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS geo_source TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS geo_needs_review BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_geo_check') THEN
    ALTER TABLE attendance ADD CONSTRAINT attendance_geo_check CHECK (
      (geo_status IS NULL OR geo_status IN ('inside', 'outside', 'denied', 'unavailable', 'no_fence'))
      AND (geo_source IS NULL OR geo_source IN ('server', 'phone'))
      AND (geo_distance_m IS NULL OR geo_distance_m >= 0)
    );
  END IF;
END $$;
