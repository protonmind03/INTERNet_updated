-- 044: a coordinator's saved views of the filter bar.
--
-- The filter bar above the coordinator's lists (term, college, program,
-- block, company, supervisor) can be saved under a name, "BSIT 4A" say,
-- and chosen again from a dropdown. A view belongs to the coordinator who
-- saved it; nobody else sees it.
--
-- `filters` holds only the six choices of the bar, by id, as the bar sends
-- them. A view that names a block or term since removed simply chooses
-- nothing for it when it is applied.
--
-- Additive only. The foreign key is NOT VALID.

CREATE TABLE IF NOT EXISTS filter_views (
  id             SERIAL PRIMARY KEY,
  coordinator_id VARCHAR(50) NOT NULL,
  name           TEXT NOT NULL CHECK (LENGTH(TRIM(name)) BETWEEN 1 AND 60),
  filters        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A coordinator's views have different names, whatever the capitals.
CREATE UNIQUE INDEX IF NOT EXISTS filter_views_owner_name_key
  ON filter_views (coordinator_id, LOWER(TRIM(name)));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_filter_views_coordinator') THEN
    ALTER TABLE filter_views
      ADD CONSTRAINT fk_filter_views_coordinator
      FOREIGN KEY (coordinator_id) REFERENCES coordinators(coordinator_id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
