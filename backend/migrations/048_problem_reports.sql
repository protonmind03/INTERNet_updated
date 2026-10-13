-- 048: the faults the system has noticed in itself.
--
-- Until now a fault was one line in the host's log, which only whoever
-- looks after the hosting can read, and only for as long as the host
-- keeps it. From here on each kind of fault is also kept here, once, with
-- how many times it has happened and when it was first and last seen, so
-- a coordinator can see that something is going wrong (and tell whoever
-- can fix it) without access to the host.
--
-- What is kept is deliberately little (services/problems.ts):
--   from the server   the label of the log line ("ASSIGN TASK ERROR") and
--                     the kind of error (its name, a database error's
--                     code). Never the error's message, which can quote a
--                     value someone typed.
--   from a browser    the crash message, the page's path and the app
--                     version, as the crash report already sent them.
-- Nothing about who was signed in. Rows not seen for 30 days are removed.
--
-- Additive only. No foreign keys.

CREATE TABLE IF NOT EXISTS problem_reports (
  id          BIGSERIAL PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  source      TEXT NOT NULL CHECK (source IN ('server', 'browser')),
  label       TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  route       TEXT NOT NULL DEFAULT '',
  times       INTEGER NOT NULL DEFAULT 1 CHECK (times >= 1),
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_problem_reports_last_seen ON problem_reports (last_seen DESC);
