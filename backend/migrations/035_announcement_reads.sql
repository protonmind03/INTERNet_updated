-- 035: who has seen an announcement.
--
-- One row the first time a student or supervisor has an announcement on
-- their Announcements page. The coordinator sees the count beside how many
-- people it was sent to.

CREATE TABLE IF NOT EXISTS announcement_reads (
  id SERIAL PRIMARY KEY,
  announcement_id INTEGER NOT NULL,
  role VARCHAR(20) NOT NULL,
  account_id VARCHAR(50) NOT NULL,
  read_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_announcement_reads
  ON announcement_reads (announcement_id, role, account_id);
