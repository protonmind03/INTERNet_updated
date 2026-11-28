-- =====================================================================
-- MIGRATION 093 — Remove the default coordinator account.
--
-- Migration 002 used to seed COORD-0001 (coordinator@internet.psu.edu.ph)
-- with a password anyone could read in the repository. A database made
-- from scratch got it back each time, production after its reset too.
--
-- It is removed only while it is still that untouched default: the same
-- email and the original password hash. A COORD-0001 given another email
-- or password (a real coordinator, the showcase data) stays.
--
-- What it cascades to (coordinator_scopes, filter_views) belongs to that
-- account alone. Test databases get it again from `npm run db:seed-demo`.
-- =====================================================================

DELETE FROM coordinators
WHERE coordinator_id = 'COORD-0001'
  AND LOWER(email) = 'coordinator@internet.psu.edu.ph'
  AND password = '$2b$10$dj4vBZz0AoFZhj4bIR6nJ.K/boFkQDbpy2I4YHQStjbxSduxqBiEa';
