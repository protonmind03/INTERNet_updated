import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Pool, PoolClient } from "pg";

/*
|--------------------------------------------------------------------------
| PASSKEYS: CONFIRMING A STEP WITH THE PHONE'S SCREEN LOCK
|--------------------------------------------------------------------------
|
| Iteration 22 (migration 069). A trainee may register passkeys; when they
| have one, Lunch break, End break and Time out are confirmed with it. The
| rules:
|
|   - The relying party is the app's own address: its host from FRONTEND_URL
|     (the rpID) and the origins in FRONTEND_URL and CORS_ORIGINS.
|   - Every challenge is used once (webauthn_challenges.used_at). An online
|     step challenge lasts 5 minutes. One handed out with an offline voucher
|     is for that voucher's day and step only.
|   - A passkey never blocks a step (decision D7): without one the step is
|     recorded as 'none', and a cancelled, failed or expired confirmation as
|     'failed'. The supervisor sees which.
|   - Single use rests on the challenge, not the signature counter (a synced
|     passkey reports 0). The counter is kept when it rises, and a non-zero
|     counter that goes down is a failure.
|
*/

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type PasskeyStep = "break" | "break-end" | "time-out";
export const PASSKEY_STEPS: PasskeyStep[] = ["break", "break-end", "time-out"];

export const STEP_CHALLENGE_MINUTES = 5;
export const REGISTER_CHALLENGE_MINUTES = 5;
/** How long a challenge handed out with a voucher may wait, as the longest an offline step may (72 h). */
export const OFFLINE_CHALLENGE_HOURS = 72;

export type StepVerification = {
  method: "passkey" | "none" | "failed";
  at: string;
  credentialId: string | null;
  /** Why it failed, in a few words, for the supervisor's detail. */
  reason?: string;
};

/** The relying party: rpID from FRONTEND_URL's host; origins from FRONTEND_URL and CORS_ORIGINS. */
export function relyingParty(env: Record<string, string | undefined> = process.env): { rpID: string; rpName: string; origins: string[] } {
  const front = env.FRONTEND_URL || "http://localhost:5173";
  let rpID = "localhost";
  try {
    rpID = new URL(front).hostname;
  } catch {
    /* the default */
  }
  const origins = [front, ...(env.CORS_ORIGINS || "").split(",")]
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => /^https?:\/\//.test(origin));
  return { rpID, rpName: "INTERNet", origins: [...new Set(origins)] };
}

/** The challenge a client data JSON says it answers (base64url). */
export function challengeOf(response: { response?: { clientDataJSON?: string } } | null | undefined): string | null {
  try {
    const json = Buffer.from(String(response?.response?.clientDataJSON || ""), "base64url").toString("utf8");
    const challenge = JSON.parse(json).challenge;
    return typeof challenge === "string" && /^[\w-]{16,200}$/.test(challenge) ? challenge : null;
  } catch {
    return null;
  }
}

type Credential = {
  id: number;
  credential_id: string;
  public_key: Buffer;
  sign_count: string;
  transports: string[] | null;
};

export async function activeCredentials(db: Queryable, studentId: string): Promise<Credential[]> {
  return (
    await db.query<Credential>(
      `SELECT id, credential_id, public_key, sign_count, transports FROM webauthn_credentials
       WHERE student_id = $1 AND revoked_at IS NULL ORDER BY id`,
      [studentId]
    )
  ).rows;
}

/** Options for registering a passkey on this device, with its challenge kept. */
export async function registrationOptions(db: Queryable, student: { student_id: string; email: string; name: string }) {
  const { rpID, rpName } = relyingParty();
  const existing = await activeCredentials(db, student.student_id);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: student.email,
    userDisplayName: student.name,
    userID: new TextEncoder().encode(student.student_id),
    attestationType: "none",
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
    excludeCredentials: existing.map((credential) => ({ id: credential.credential_id, transports: (credential.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined })),
  });
  await db.query(`INSERT INTO webauthn_challenges (challenge, student_id, purpose) VALUES ($1, $2, 'register')`, [options.challenge, student.student_id]);
  return options;
}

/** Checks a registration and keeps the passkey. Returns why not, when not. */
export async function finishRegistration(db: Queryable, studentId: string, response: RegistrationResponseJSON, label: string | null): Promise<{ ok: true; id: number } | { ok: false; problem: string }> {
  const challenge = challengeOf(response as never);
  if (!challenge) return { ok: false, problem: "The passkey's answer could not be read." };
  const claimed = await db.query(
    `UPDATE webauthn_challenges SET used_at = NOW()
     WHERE challenge = $1 AND student_id = $2 AND purpose = 'register' AND used_at IS NULL
       AND issued_at > NOW() - make_interval(mins => $3)
     RETURNING challenge`,
    [challenge, studentId, REGISTER_CHALLENGE_MINUTES]
  );
  if (claimed.rows.length === 0) return { ok: false, problem: "That passkey request was used already or has expired. Try again." };
  const { rpID, origins } = relyingParty();
  let verification;
  try {
    verification = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origins, expectedRPID: rpID, requireUserVerification: true });
  } catch (error) {
    return { ok: false, problem: `The passkey could not be checked: ${error instanceof Error ? error.message : "unknown"}.` };
  }
  if (!verification.verified || !verification.registrationInfo) return { ok: false, problem: "The passkey could not be checked." };
  const { credential, credentialBackedUp } = verification.registrationInfo;
  const saved = await db.query<{ id: number }>(
    `INSERT INTO webauthn_credentials (student_id, credential_id, public_key, sign_count, transports, backed_up, device_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (credential_id) DO NOTHING RETURNING id`,
    [studentId, credential.id, Buffer.from(credential.publicKey), credential.counter, credential.transports ?? response.response.transports ?? null, credentialBackedUp, label ? label.slice(0, 80) : null]
  );
  if (saved.rows.length === 0) return { ok: false, problem: "That passkey is already registered." };
  return { ok: true, id: saved.rows[0].id };
}

/** A challenge for confirming one step: online (5 minutes) or for a voucher's day. Null without a passkey. */
export async function stepOptions(db: Queryable, studentId: string, step: PasskeyStep, validDate: string | null = null) {
  const credentials = await activeCredentials(db, studentId);
  if (credentials.length === 0) return null;
  const { rpID } = relyingParty();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: credentials.map((credential) => ({ id: credential.credential_id, transports: (credential.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined })),
  });
  await db.query(
    `INSERT INTO webauthn_challenges (challenge, student_id, purpose, valid_date, step) VALUES ($1, $2, 'step', $3::date, $4)`,
    [options.challenge, studentId, validDate, step]
  );
  return options;
}

/**
 * How a step was confirmed. `body.passkey` is the assertion, when the phone
 * made one; `body.passkey_status` is 'failed' when the prompt was cancelled
 * or failed. Never throws and never refuses: the step goes on regardless.
 * `logDate` is the log's day ("YYYY-MM-DD"), for a challenge handed out
 * with a voucher.
 */
export async function verifyStep(db: Queryable, studentId: string, step: PasskeyStep, logDate: string, body: Record<string, unknown>): Promise<StepVerification> {
  const at = new Date().toISOString();
  const failed = (reason: string, credentialId: string | null = null): StepVerification => ({ method: "failed", at, credentialId, reason });
  const response = body.passkey as AuthenticationResponseJSON | undefined;
  if (!response || typeof response !== "object") {
    return body.passkey_status === "failed" ? failed("cancelled or not available") : { method: "none", at, credentialId: null };
  }
  try {
    const challenge = challengeOf(response as never);
    if (!challenge) return failed("unreadable");
    // The challenge, once: this student's, for this step, still in time.
    const claimed = await db.query<{ valid_date: string | null }>(
      `UPDATE webauthn_challenges SET used_at = NOW()
       WHERE challenge = $1 AND student_id = $2 AND purpose = 'step' AND used_at IS NULL AND step = $3
         AND (
           (valid_date IS NULL AND issued_at > NOW() - make_interval(mins => $4))
           OR (valid_date = $5::date AND issued_at > NOW() - make_interval(hours => $6))
         )
       RETURNING TO_CHAR(valid_date, 'YYYY-MM-DD') AS valid_date`,
      [challenge, studentId, step, STEP_CHALLENGE_MINUTES, logDate, OFFLINE_CHALLENGE_HOURS]
    );
    if (claimed.rows.length === 0) return failed("used already, expired, or for another step or day");
    const credential = (await activeCredentials(db, studentId)).find((item) => item.credential_id === response.id);
    if (!credential) return failed("not one of this trainee's passkeys", response.id);
    const { rpID, origins } = relyingParty();
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: credential.credential_id,
        publicKey: new Uint8Array(credential.public_key),
        counter: Number(credential.sign_count),
        transports: (credential.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
      },
    });
    if (!result.verified) return failed("signature did not match", credential.credential_id);
    const next = result.authenticationInfo.newCounter;
    const stored = Number(credential.sign_count);
    if (stored > 0 && next > 0 && next < stored) return failed("counter went back", credential.credential_id);
    await db.query(
      `UPDATE webauthn_credentials SET last_used_at = NOW(), sign_count = GREATEST(sign_count, $2) WHERE id = $1`,
      [credential.id, next]
    );
    return { method: "passkey", at, credentialId: credential.credential_id };
  } catch (error) {
    return failed(error instanceof Error ? error.message.slice(0, 120) : "could not be checked");
  }
}

/** Writes a step's verification onto its log, beside the other steps'. */
export async function recordStepVerification(db: Queryable, attendanceId: number, step: PasskeyStep, verification: StepVerification): Promise<void> {
  await db.query(
    `UPDATE attendance SET step_verifications = COALESCE(step_verifications, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb) WHERE id = $1`,
    [attendanceId, step, JSON.stringify(verification)]
  );
}
