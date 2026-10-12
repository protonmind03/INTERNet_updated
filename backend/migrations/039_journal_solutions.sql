-- 039: the weekly report's fourth part.
--
-- The weekly journal (migration 026) is now called the weekly report on
-- screen, and asks for one more thing: what the student tried, or worked
-- out, about the problems they met. It is optional, and entries written
-- before it simply have none.
--
-- The table and its other columns keep their names: activities is "What I
-- did", learnings "What I learned", challenges "Problems encountered".
-- Older code that does not send or read `solutions` keeps working.

ALTER TABLE journals ADD COLUMN IF NOT EXISTS solutions TEXT;
