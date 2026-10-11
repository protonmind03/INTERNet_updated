-- 034: the coordinator's visits to host companies.
--
-- One row per visit: which company, when, who went, what was found, and
-- anything to follow up. `company_id` points at the company record.

CREATE TABLE IF NOT EXISTS site_visits (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  visit_date DATE NOT NULL,
  visited_by VARCHAR(50) NOT NULL,
  visited_by_name TEXT NOT NULL,
  findings TEXT NOT NULL,
  follow_up TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_visits_company ON site_visits (company_id, visit_date DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_site_visits_company') THEN
    ALTER TABLE site_visits
      ADD CONSTRAINT fk_site_visits_company
      FOREIGN KEY (company_id) REFERENCES companies (id) NOT VALID;
  END IF;
END $$;
