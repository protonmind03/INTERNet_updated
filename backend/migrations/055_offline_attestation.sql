-- 055: a time-in with a photo when the phone has no connection.
--
-- Until now a time-in recorded offline had no photo and no camera check.
-- Now, while the app is online, it registers a key that never leaves the
-- phone and collects "vouchers" for the student's next scheduled days.
-- Offline, the app runs the camera check with a voucher's prompts, and
-- the phone's key signs what it recorded (the voucher, the photo's
-- SHA-256, the time, a counter, the clock gap measured when the voucher
-- was issued). The server checks all of it when the time-in arrives
-- (routes/offlineTimeIn.ts, services/offlineAttestation.ts).
--
--   device_keys        one row per student and phone install: the public
--                      half of the phone's ECDSA P-256 key (JWK), its id
--                      (the key's RFC 7638 thumbprint), and the highest
--                      counter accepted from it, so a signed record cannot
--                      be sent twice. revoked_at ends a key.
--   offline_vouchers   one row per voucher: the day it is for, the prompts
--                      it carries, the key it is bound to, the server time
--                      it was issued and how far the phone's clock was off
--                      then (milliseconds, positive when the phone is
--                      ahead). used_at and attendance_id are set when a
--                      time-in spends it; a voucher is spent once.
--   attendance.offline_attestation
--                      what was checked for an attested offline time-in:
--                      the voucher, the key, the counter, the photo's
--                      hash, both clock gaps and whether they differ by
--                      more than two minutes. NULL for every other log.
--   attendance.clock_skew_seconds
--                      added by 051; repeated here only so this file says
--                      everything an attested time-in uses.
--
-- Existing rows: no keys and no vouchers exist yet; every existing log
-- keeps offline_attestation NULL, which means it was not an attested
-- offline time-in (a photo-less offline time-in stays NULL too).
--
-- Additive and safe to run again. The foreign keys are NOT VALID.

CREATE TABLE IF NOT EXISTS device_keys (
  id              SERIAL PRIMARY KEY,
  student_id      VARCHAR(50) NOT NULL,
  key_id          TEXT NOT NULL,
  public_key_jwk  JSONB NOT NULL,
  counter         BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMP,
  revoked_at      TIMESTAMP,
  UNIQUE (student_id, key_id)
);

CREATE TABLE IF NOT EXISTS offline_vouchers (
  jti               UUID PRIMARY KEY,
  student_id        VARCHAR(50) NOT NULL,
  device_key_id     INTEGER NOT NULL,
  valid_date        DATE NOT NULL,
  prompts           JSONB NOT NULL,
  issued_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  server_offset_ms  INTEGER,
  used_at           TIMESTAMP,
  attendance_id     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_offline_vouchers_student_date
  ON offline_vouchers (student_id, valid_date);

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS offline_attestation JSONB;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS clock_skew_seconds INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_device_keys_student') THEN
    ALTER TABLE device_keys
      ADD CONSTRAINT fk_device_keys_student
      FOREIGN KEY (student_id) REFERENCES students(student_id)
      ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_offline_vouchers_student') THEN
    ALTER TABLE offline_vouchers
      ADD CONSTRAINT fk_offline_vouchers_student
      FOREIGN KEY (student_id) REFERENCES students(student_id)
      ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_offline_vouchers_key') THEN
    ALTER TABLE offline_vouchers
      ADD CONSTRAINT fk_offline_vouchers_key
      FOREIGN KEY (device_key_id) REFERENCES device_keys(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_offline_vouchers_attendance') THEN
    ALTER TABLE offline_vouchers
      ADD CONSTRAINT fk_offline_vouchers_attendance
      FOREIGN KEY (attendance_id) REFERENCES attendance(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
