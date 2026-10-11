-- 036: camera-check tickets that have been spent.
--
-- A time-in presents the ticket its camera check was issued. The ticket's
-- id is written here the first time, and a second time-in carrying the
-- same ticket is refused. A ticket lasts ten minutes; rows older than a
-- day are removed by the reminder loop.

CREATE TABLE IF NOT EXISTS liveness_ticket_uses (
  jti TEXT PRIMARY KEY,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
