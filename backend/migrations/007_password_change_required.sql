-- Accounts whose password was chosen by someone else (the seeded
-- coordinator, and every account a coordinator registers) must replace it
-- at first login. The API enforces this flag in production.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE supervisors
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE coordinators
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- The coordinator seeded by migration 002 still has its published default
-- password if the stored hash is unchanged.
UPDATE coordinators
SET must_change_password = TRUE
WHERE password = '$2b$10$dj4vBZz0AoFZhj4bIR6nJ.K/boFkQDbpy2I4YHQStjbxSduxqBiEa';
