-- 080: the OJT Director's account and coordinator scopes (Phase 1.6, November 2026).
--
-- A fourth portal, /director, for the OJT Director: the campus at a glance,
-- programs and their hours, the coordinators and what each may see, the
-- term's rules, approvals, reports and audit. Its accounts are in their own
-- table with the same account columns as coordinators (auth_version,
-- must_change_password, is_active and the contact fields of migration 060).
--
-- Every CHECK that lists the roles gains 'director' and 'admin' (the IT
-- administrator, Phase 1.7), so 1.7 changes no constraint again. Each is
-- dropped and added again by name, in this migration only:
--   005  password_reset_tokens.role, web_push_subscriptions.role
--   010  complaint_messages.author_role
--   019  audit_log.actor_role
--   059  message_threads.party_a_role / party_b_role,
--        messages.sender_role / recipient_role
-- notifications gain director_id and admin_id, as coordinators had
-- coordinator_id (002); announcements may go to the coordinators.
--
-- coordinator_scopes: the colleges or programs a coordinator looks after.
-- A coordinator with no row sees every student, as today.
--
-- Nothing existing changes: until a director account exists the
-- coordinators keep every power they have (server.ts, hasActiveDirector).

CREATE TABLE IF NOT EXISTS directors (
  id                SERIAL PRIMARY KEY,
  director_id       VARCHAR(50) UNIQUE NOT NULL,
  email             VARCHAR(150) UNIQUE NOT NULL,
  password          VARCHAR(255) NOT NULL,
  name              VARCHAR(150) NOT NULL,
  department        VARCHAR(150),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  auth_version      INTEGER NOT NULL DEFAULT 0,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  mobile_number     VARCHAR(30),
  show_mobile       BOOLEAN NOT NULL DEFAULT FALSE,
  position          VARCHAR(150),
  office_hours      VARCHAR(150),
  preferred_contact VARCHAR(20) CHECK (preferred_contact IS NULL OR preferred_contact IN ('email', 'mobile', 'message', 'office')),
  office_location   VARCHAR(150)
);
CREATE UNIQUE INDEX IF NOT EXISTS directors_email_lower_key ON directors (LOWER(email));

CREATE TABLE IF NOT EXISTS coordinator_scopes (
  id             SERIAL PRIMARY KEY,
  coordinator_id VARCHAR(50) NOT NULL REFERENCES coordinators (coordinator_id) ON DELETE CASCADE,
  college_id     INTEGER NULL REFERENCES colleges (id) ON DELETE CASCADE,
  program_id     INTEGER NULL REFERENCES programs (id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coordinator_scopes_one_level CHECK ((college_id IS NULL) <> (program_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS coordinator_scopes_unique
  ON coordinator_scopes (coordinator_id, COALESCE(college_id, 0), COALESCE(program_id, 0));
CREATE INDEX IF NOT EXISTS coordinator_scopes_coordinator ON coordinator_scopes (coordinator_id);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS director_id VARCHAR(50);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS admin_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS notifications_director ON notifications (director_id, created_at DESC) WHERE director_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_admin ON notifications (admin_id, created_at DESC) WHERE admin_id IS NOT NULL;

-- The role lists, widened. A constraint is replaced only by its own name.
ALTER TABLE password_reset_tokens DROP CONSTRAINT IF EXISTS password_reset_tokens_role_check;
ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_role_check
  CHECK (role IN ('student', 'supervisor', 'coordinator', 'director', 'admin'));

ALTER TABLE web_push_subscriptions DROP CONSTRAINT IF EXISTS web_push_subscriptions_role_check;
ALTER TABLE web_push_subscriptions ADD CONSTRAINT web_push_subscriptions_role_check
  CHECK (role IN ('student', 'supervisor', 'coordinator', 'director', 'admin'));

ALTER TABLE complaint_messages DROP CONSTRAINT IF EXISTS complaint_messages_author_role_check;
ALTER TABLE complaint_messages ADD CONSTRAINT complaint_messages_author_role_check
  CHECK (author_role IN ('student', 'supervisor', 'coordinator', 'director', 'admin'));

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_role_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_role_check
  CHECK (actor_role IN ('student', 'supervisor', 'coordinator', 'director', 'admin'));

ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS message_threads_party_a_role_check;
ALTER TABLE message_threads ADD CONSTRAINT message_threads_party_a_role_check
  CHECK (party_a_role IN ('student', 'supervisor', 'coordinator', 'director', 'admin'));
ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS message_threads_party_b_role_check;
ALTER TABLE message_threads ADD CONSTRAINT message_threads_party_b_role_check
  CHECK (party_b_role IN ('student', 'supervisor', 'coordinator', 'director', 'admin'));

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_sender_role_check
  CHECK (sender_role IN ('student', 'supervisor', 'coordinator', 'director', 'admin'));
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_recipient_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_recipient_role_check
  CHECK (recipient_role IN ('student', 'supervisor', 'coordinator', 'director', 'admin'));

ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_audience_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_audience_check
  CHECK (audience IN ('students', 'supervisors', 'coordinators', 'everyone'));
