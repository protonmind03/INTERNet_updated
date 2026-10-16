-- 052: each run of the nightly clean-up of old time-in photos.
--
-- When PHOTO_RETENTION_DAYS is set, the server removes time-in photos older
-- than that each night at 02:30 Philippine time (services/photoPurge.ts).
-- Each run is written here: when, under which setting, how many photos were
-- removed and how many files could not be deleted. The coordinator's "What
-- is switched on" card shows the last one. `ran_on` is the Philippine date,
-- one run per date; a run started by hand with the script is kept too, with
-- `by_hand` set.
--
-- Only counts are kept: no student, no file name.
--
-- Additive only. There were no runs before, so the table starts empty.

CREATE TABLE IF NOT EXISTS photo_purge_runs (
  id             BIGSERIAL PRIMARY KEY,
  ran_on         DATE NOT NULL,
  ran_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_days INTEGER NOT NULL,
  removed        INTEGER NOT NULL DEFAULT 0,
  failed         INTEGER NOT NULL DEFAULT 0,
  by_hand        BOOLEAN NOT NULL DEFAULT FALSE
);

-- The nightly run happens once a date, whatever number of servers are running.
CREATE UNIQUE INDEX IF NOT EXISTS photo_purge_runs_nightly_key
  ON photo_purge_runs (ran_on) WHERE by_hand = FALSE;
