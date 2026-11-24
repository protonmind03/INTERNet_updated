-- 081: the IT administrator's accounts and the maintenance notice (Phase 1.7, November 2026).
--
-- A fifth portal, /admin, for the university's IT/MIS person, who runs the
-- system and never sees students' records, documents, photos, evaluations,
-- grades or messages. Accounts are in system_admins, with the same account
-- columns as the other staff. The first one is made only by the command
-- line (npm run admin:create); there is no sign-up and no route that makes
-- one, except an administrator making another. The role CHECKs already
-- allow 'admin' (migration 080).
--
-- system_notice holds the one maintenance message shown at the top of every
-- portal (empty: none). It carries nothing personal, so every portal may
-- read it and keep it for offline use.

CREATE TABLE IF NOT EXISTS system_admins (
  id                   SERIAL PRIMARY KEY,
  admin_id             VARCHAR(50) UNIQUE NOT NULL,
  email                VARCHAR(150) UNIQUE NOT NULL,
  password             VARCHAR(255) NOT NULL,
  name                 VARCHAR(150) NOT NULL,
  department           VARCHAR(150),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  auth_version         INTEGER NOT NULL DEFAULT 0,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS system_admins_email_lower_key ON system_admins (LOWER(email));

CREATE TABLE IF NOT EXISTS system_notice (
  id         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  message    TEXT NULL CHECK (message IS NULL OR LENGTH(message) BETWEEN 3 AND 300),
  updated_by VARCHAR(50),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO system_notice (id, message) VALUES (1, NULL) ON CONFLICT (id) DO NOTHING;
