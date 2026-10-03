-- 015: tokens handed back at sign-out. A row is kept only until the token
-- would have expired anyway.

CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
