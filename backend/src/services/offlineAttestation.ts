import { createHash, createPublicKey, verify, type JsonWebKeyInput } from "node:crypto";

/*
|--------------------------------------------------------------------------
| AN OFFLINE TIME-IN WITH A PHOTO: THE CHECKS
|--------------------------------------------------------------------------
|
| The camera check needs a ticket from the server, which a phone with no
| connection cannot get. So the server hands out the freshness in advance:
|
|   device key   made on the phone with WebCrypto (ECDSA P-256), never
|                exported; its public half is registered to the student.
|                Later records signed with it came from that app install.
|   voucher      a signed token for one of the student's next scheduled
|                days: an id, the day, the prompts to follow, the key it is
|                bound to, and how far the phone's clock was off when it
|                was issued. Spent once.
|   attestation  what the phone signs after the check: the voucher's id,
|                the photo's SHA-256, the phone's time, a counter that only
|                goes up, and the clock gap at issue.
|
| When the time-in arrives the server checks the voucher, the key, the
| signature, the photo against its hash, the counter, and the clock gap
| again. A clock moved while offline is not refused: the log is flagged
| and the reviewer sees both gaps.
|
| What this proves is continuity of one app install, not that a real person
| stood at the workplace. Someone who controls their own browser deeply
| enough can still forge a capture; the supervisor's confirmation remains
| the control.
|
*/

/** Beyond this difference between the clock gap at issue and at sync, the phone's clock was moved. */
export const CLOCK_MOVED_SECONDS = 120;
/** How many keys a student may have registered at once; a new one past this retires the oldest. */
export const MAX_DEVICE_KEYS = 5;
/** Vouchers handed out at a time. */
export const VOUCHERS_AT_ONCE = 2;
/** How far ahead vouchers are looked for. */
export const VOUCHER_DAYS_AHEAD = 14;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type PublicJwk = { kty: "EC"; crv: "P-256"; x: string; y: string };

/** Reads a public key the phone sends; never a private one. */
export function readPublicJwk(raw: unknown): { jwk: PublicJwk } | { problem: string } {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const problem = { problem: "That device key could not be read." };
  if (!input) return problem;
  if ("d" in input) return { problem: "Only the public half of the device key is sent." };
  const { kty, crv, x, y } = input;
  if (kty !== "EC" || crv !== "P-256") return problem;
  if (typeof x !== "string" || typeof y !== "string" || !BASE64URL.test(x) || !BASE64URL.test(y)) return problem;
  const jwk: PublicJwk = { kty, crv, x, y };
  try {
    createPublicKey({ key: jwk as JsonWebKeyInput["key"], format: "jwk" });
  } catch {
    return problem;
  }
  return { jwk };
}

/** The key's id: its RFC 7638 thumbprint (SHA-256 of its required members, in order). */
export function keyThumbprint(jwk: PublicJwk): string {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return createHash("sha256").update(canonical).digest("base64url");
}

export type Attestation = {
  voucher_jti: string;
  key_id: string;
  photo_sha256: string;
  /** The phone's clock when the photo was taken. */
  local_time: string;
  counter: number;
  /** The clock gap the phone was told when the voucher was issued, in milliseconds. */
  offset_at_issue_ms: number;
};

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

/** Reads the attestation the phone sends, as a JSON string. */
export function readAttestation(raw: unknown): { attestation: Attestation } | { problem: string } {
  const problem = { problem: "The record signed by your phone could not be read. Time in again, or ask your supervisor." };
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(typeof raw === "string" ? raw : "");
  } catch {
    return problem;
  }
  if (!input || typeof input !== "object") return problem;
  const { voucher_jti, key_id, photo_sha256, local_time, counter, offset_at_issue_ms } = input;
  if (
    typeof voucher_jti !== "string" ||
    !/^[0-9a-f-]{36}$/.test(voucher_jti) ||
    typeof key_id !== "string" ||
    !BASE64URL.test(key_id) ||
    typeof photo_sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(photo_sha256) ||
    typeof local_time !== "string" ||
    !ISO_TIME.test(local_time) ||
    typeof counter !== "number" ||
    !Number.isSafeInteger(counter) ||
    counter < 1 ||
    typeof offset_at_issue_ms !== "number" ||
    !Number.isSafeInteger(offset_at_issue_ms)
  ) {
    return problem;
  }
  return { attestation: { voucher_jti, key_id, photo_sha256, local_time, counter, offset_at_issue_ms } };
}

/**
 * The exact text the phone signs. The app builds the same string
 * (my-pwa/src/lib/attestation.ts); the order of the fields is fixed.
 */
export function attestationMessage(attestation: Attestation): string {
  return JSON.stringify([
    "internet-offline-time-in-v1",
    attestation.voucher_jti,
    attestation.key_id,
    attestation.photo_sha256,
    attestation.local_time,
    attestation.counter,
    attestation.offset_at_issue_ms,
  ]);
}

/** Checks a WebCrypto ECDSA P-256 / SHA-256 signature (raw r||s, base64url). */
export function signatureValid(jwk: PublicJwk, message: string, signature: unknown): boolean {
  if (typeof signature !== "string" || !BASE64URL.test(signature)) return false;
  const bytes = Buffer.from(signature, "base64url");
  if (bytes.length !== 64) return false;
  try {
    return verify(
      "sha256",
      Buffer.from(message, "utf8"),
      { key: createPublicKey({ key: jwk as JsonWebKeyInput["key"], format: "jwk" }), dsaEncoding: "ieee-p1363" },
      bytes
    );
  } catch {
    return false;
  }
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The phone's clock gap at issue and at sync, and whether the clock was
 * moved in between. Both are "phone minus server": positive when ahead.
 */
export function clockCheck(
  offsetAtIssueMs: number,
  skewAtSyncSeconds: number | null
): { at_issue_seconds: number; at_sync_seconds: number | null; clock_moved: boolean } {
  const atIssue = Math.round(offsetAtIssueMs / 1000);
  return {
    at_issue_seconds: atIssue,
    at_sync_seconds: skewAtSyncSeconds,
    clock_moved: skewAtSyncSeconds !== null && Math.abs(skewAtSyncSeconds - atIssue) > CLOCK_MOVED_SECONDS,
  };
}
