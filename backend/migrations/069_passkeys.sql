-- 069: passkeys, to confirm Lunch break, End break and Time out.
--
-- A trainee may register a passkey on their phone (Profile, Security and
-- device): the phone's own screen lock (fingerprint, face or PIN). When
-- they have one, the app asks for it before sending Lunch break, End break
-- and Time out. It never stops a step: without a passkey, or when the
-- prompt is cancelled or fails, the step is recorded and says so, and the
-- supervisor sees how each step was made.
--
--   webauthn_credentials   one row per passkey: its id and public key, the
--                          signature counter, how it is reached
--                          (transports), whether it is synced (backed_up),
--                          a label, when it was made and last used, and
--                          when it was removed (revoked_at).
--   webauthn_challenges    one row per challenge handed out, each usable
--                          once (used_at). 'register' for adding a passkey;
--                          'step' for confirming one step: with valid_date
--                          and step when it was handed out with an offline
--                          voucher, to be signed on the phone with no
--                          connection.
--   attendance.step_verifications
--                          per step ('break', 'break-end', 'time-out'): how
--                          it was confirmed { method: 'passkey' | 'none' |
--                          'failed', at, credentialId }, and for End break
--                          on the strict level, the camera check. Existing
--                          rows: NULL (made before passkeys).
--   offline_action_ledger.verification
--                          the same, for a step that arrived later.
--
-- Foreign keys NOT VALID, as in 049 onward. Additive and safe to run again.

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id             SERIAL PRIMARY KEY,
  student_id     VARCHAR(50) NOT NULL,
  credential_id  TEXT NOT NULL UNIQUE,
  public_key     BYTEA NOT NULL,
  sign_count     BIGINT NOT NULL DEFAULT 0,
  transports     TEXT[],
  backed_up      BOOLEAN NOT NULL DEFAULT FALSE,
  device_label   VARCHAR(80),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at   TIMESTAMP,
  revoked_at     TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challenge   TEXT PRIMARY KEY,
  student_id  VARCHAR(50) NOT NULL,
  purpose     VARCHAR(20) NOT NULL,
  valid_date  DATE,
  step        VARCHAR(12),
  issued_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  used_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_student ON webauthn_challenges (student_id, valid_date);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_student ON webauthn_credentials (student_id) WHERE revoked_at IS NULL;

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS step_verifications JSONB;
ALTER TABLE offline_action_ledger ADD COLUMN IF NOT EXISTS verification JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webauthn_challenges_purpose_check') THEN
    ALTER TABLE webauthn_challenges ADD CONSTRAINT webauthn_challenges_purpose_check
      CHECK (purpose IN ('register', 'step', 'login')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_webauthn_credentials_student') THEN
    ALTER TABLE webauthn_credentials
      ADD CONSTRAINT fk_webauthn_credentials_student
      FOREIGN KEY (student_id) REFERENCES students(student_id)
      ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_webauthn_challenges_student') THEN
    ALTER TABLE webauthn_challenges
      ADD CONSTRAINT fk_webauthn_challenges_student
      FOREIGN KEY (student_id) REFERENCES students(student_id)
      ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
