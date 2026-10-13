-- 047: how many emails the server has sent each day.
--
-- A free email plan allows a fixed number of emails a day. When
-- EMAIL_DAILY_LIMIT is set, the server counts each email here before it
-- sends it and stops when the day's allowance is used, keeping a share
-- back for password recovery (services/emailBudget.ts). With the variable
-- unset nothing is counted and email behaves as before.
--
-- One row per day (the day in UTC, the clock email providers count by).
-- Only a number is kept: never an address, a subject or a message.
--
-- Additive only.

CREATE TABLE IF NOT EXISTS email_daily_counts (
  day  DATE PRIMARY KEY,
  sent INTEGER NOT NULL DEFAULT 0 CHECK (sent >= 0)
);
