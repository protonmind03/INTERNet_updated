-- 018: where a notification leads.
--
-- Until now each portal guessed the page a notification was about from the
-- words in its title. The server knows what it is about when it writes the
-- notification, so it now stores that:
--
-- * link         the page to open, as a path inside the app
--                ("/daily-log", "/coordinator/students/2021-0001")
-- * entity_type  the kind of record it is about ("attendance", "task",
--                "document", "complaint", "student", ...), when one is known
-- * entity_id    that record's id, as text
--
-- All three are optional. Rows written before this migration keep NULLs and
-- the portals go on working out their page from the title, as before.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS link TEXT,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id TEXT;
