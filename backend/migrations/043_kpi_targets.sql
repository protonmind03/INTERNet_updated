-- 043: the coordinator can change the targets of the six key figures.
--
-- Each figure on the dashboard has a target it is judged against. Until
-- now they were constants in the code (services/kpiDefinitions.ts). Those
-- constants stay as the DEFAULTS: a row here replaces one figure's target,
-- and deleting the row puts the default back. An empty table, which is
-- what this migration leaves, changes nothing.
--
-- One programme, one set of targets: they are not per coordinator.
--
-- Additive only.

CREATE TABLE IF NOT EXISTS kpi_targets (
  key        VARCHAR(40) PRIMARY KEY,
  target     NUMERIC(8,2) NOT NULL CHECK (target >= 0),
  updated_by VARCHAR(50),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
