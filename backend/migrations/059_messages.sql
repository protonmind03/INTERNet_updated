-- 059: messages between people in INTERNet.
--
-- A student, a supervisor or the coordinator writes to someone from a
-- composer in the app. Every message is kept as a thread between two
-- people, raises a notification whose link opens the thread to reply, and
-- is emailed when email is switched on (from SMTP_FROM, with Reply-To set
-- to the sender). See routes/messages.ts.
--
--   message_threads  subject; what it is about (context_type and
--                    context_id, with the label shown on the chip, for
--                    example an attendance log); the two people in it
--                    (role and id each); who started it; when the last
--                    message came.
--   messages         one row per message: its thread, who sent it and to
--                    whom (role and id each, and the sender's name as it
--                    was), the text, whether it was emailed (email_status:
--                    'sent', 'off' when email is not switched on,
--                    'no_address', 'limit' when the day's allowance was
--                    used, 'failed'), when the recipient read it.
--
-- Existing rows: none; both tables are new. (Concern conversations keep
-- their own table, complaint_messages, and an appeal's thread_id can point
-- here later.)
--
-- Additive and safe to run again.

CREATE TABLE IF NOT EXISTS message_threads (
  id               SERIAL PRIMARY KEY,
  subject          TEXT NOT NULL,
  context_type     VARCHAR(30),
  context_id       VARCHAR(80),
  context_label    TEXT,
  party_a_role     VARCHAR(20) NOT NULL CHECK (party_a_role IN ('student', 'supervisor', 'coordinator')),
  party_a_id       VARCHAR(50) NOT NULL,
  party_b_role     VARCHAR(20) NOT NULL CHECK (party_b_role IN ('student', 'supervisor', 'coordinator')),
  party_b_id       VARCHAR(50) NOT NULL,
  created_by_role  VARCHAR(20) NOT NULL,
  created_by_id    VARCHAR(50) NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  last_message_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_threads_party_a ON message_threads (party_a_role, party_a_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_threads_party_b ON message_threads (party_b_role, party_b_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  thread_id       INTEGER NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_role     VARCHAR(20) NOT NULL CHECK (sender_role IN ('student', 'supervisor', 'coordinator')),
  sender_id       VARCHAR(50) NOT NULL,
  sender_name     TEXT,
  recipient_role  VARCHAR(20) NOT NULL CHECK (recipient_role IN ('student', 'supervisor', 'coordinator')),
  recipient_id    VARCHAR(50) NOT NULL,
  body            TEXT NOT NULL,
  email_status    VARCHAR(20) NOT NULL DEFAULT 'off'
                    CHECK (email_status IN ('sent', 'off', 'no_address', 'limit', 'failed')),
  read_at         TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages (thread_id, created_at);
-- The per-sender daily count (ten a day).
CREATE INDEX IF NOT EXISTS idx_messages_sender_day ON messages (sender_role, sender_id, created_at);
