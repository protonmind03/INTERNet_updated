import { keepOfflineChallenges, rememberHasPasskey } from "./passkeys";
import type { Prompt } from "./liveness/engine";
import { faceTrackerKept, precacheFaceTracker } from "./liveness/trackerFiles";
import { API_URL, withStudentAuth } from "./api";
import { deviceInstall, nextCounter, rememberRegistration, sha256Hex, signWithDeviceKey } from "./deviceKey";
import { attestationMessage } from "./attestation";
import { readRecord, saveRecord } from "./offlineStore";

/*
|--------------------------------------------------------------------------
| A TIME-IN WITH A PHOTO, WITH NO CONNECTION
|--------------------------------------------------------------------------
|
| While the app is online (at sign-in, when the connection comes back, and
| after a time-in) the phone gets ready:
|
|   1. its key is made and registered (lib/deviceKey.ts);
|   2. it collects up to two vouchers for the student's next scheduled days,
|      each with the prompts to follow and the gap between this phone's
|      clock and the server's at that moment;
|   3. the face-tracking files are put in the service worker's caches.
|
| With no connection, the time-in dialog runs the camera check with today's
| voucher. The photo's SHA-256, the voucher, the time, the next counter and
| the clock gap at issue are signed with the phone's key, and the whole of
| it waits in the queue with the photo (lib/offlineQueue.ts) until it can be
| sent. The server checks every part (backend routes/offlineTimeIn.ts).
|
| Without a voucher, or when the camera or the face-tracking files cannot
| work, the time-in without a photo remains, as before.
|
*/

const VOUCHERS = "offline-vouchers";
/** How often the phone asks for fresh vouchers while it stays online. */
const REFRESH_MS = 10 * 60 * 1000;

export type OfflineVoucher = {
  token: string;
  jti: string;
  date: string;
  level: "standard" | "strict";
  prompts: Prompt[];
  spare: Prompt | null;
  keyId: string;
  /** The clock gap at issue, as the server measured it (phone minus server, ms). */
  offsetMs: number;
};

/** What is inside a voucher token; the phone reads it, the server checks it. */
function claimsOf(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "=")));
  } catch {
    return {};
  }
}

async function post(path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const response = await fetch(
    `${API_URL}${path}`,
    withStudentAuth({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  );
  return { status: response.status, data: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

let preparing: Promise<void> | null = null;
let preparedAt = 0;

/**
 * Gets this phone ready for a time-in with no connection. Quiet: any
 * failure leaves the phone as it was, with the photo-less time-in.
 * `force` skips the ten-minute wait between two refreshes.
 */
export function prepareOfflineTimeIn(studentId: string, force = false): Promise<void> {
  if (!studentId || !navigator.onLine) return Promise.resolve();
  if (!force && Date.now() - preparedAt < REFRESH_MS) return Promise.resolve();
  preparing ??= (async () => {
    // The face-tracking files first: without them nothing else is of use.
    void precacheFaceTracker();
    const install = await deviceInstall();
    if (!install) return;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let keyId = install.registered[studentId] ?? null;
      if (!keyId) {
        const registered = await post("/api/attendance/device-key", { public_key_jwk: install.publicJwk });
        if (registered.status !== 200 || typeof registered.data.key_id !== "string") return;
        keyId = registered.data.key_id;
        await rememberRegistration(studentId, keyId);
        install.registered[studentId] = keyId;
      }
      const issued = await post("/api/attendance/offline-vouchers", {
        key_id: keyId,
        client_sent_at: new Date().toISOString(),
      });
      // The server no longer knows this key for this student: register it again, once.
      if (issued.status === 400 && issued.data.code === "DEVICE_UNKNOWN") {
        await rememberRegistration(studentId, null);
        delete install.registered[studentId];
        continue;
      }
      if (issued.status !== 200 || !Array.isArray(issued.data.vouchers)) return;
      // Iteration 22: the passkey challenges that came with each day, kept to sign with no connection.
      let anyChallenges = false;
      for (const entry of issued.data.vouchers as Array<Record<string, unknown>>) {
        if (entry.step_challenges && typeof entry.step_challenges === "object") {
          anyChallenges = true;
          keepOfflineChallenges(String(entry.date), entry.step_challenges as Parameters<typeof keepOfflineChallenges>[1]);
        }
      }
      if ((issued.data.vouchers as unknown[]).length > 0) rememberHasPasskey(anyChallenges);
      const vouchers: OfflineVoucher[] = (issued.data.vouchers as Array<Record<string, unknown>>).map((entry) => {
        const claims = claimsOf(String(entry.token));
        return {
          token: String(entry.token),
          jti: String(claims.jti),
          date: String(entry.date),
          level: entry.level === "strict" ? "strict" : "standard",
          prompts: (Array.isArray(entry.prompts) ? entry.prompts : []) as Prompt[],
          spare: (typeof entry.spare === "string" ? entry.spare : null) as Prompt | null,
          keyId: keyId!,
          offsetMs: Number(claims.offset_ms),
        };
      });
      await saveRecord("student", VOUCHERS, vouchers);
      preparedAt = Date.now();
      return;
    }
  })()
    .catch(() => undefined)
    .finally(() => {
      preparing = null;
    });
  return preparing;
}

/** The voucher kept for a Philippine day ("YYYY-MM-DD"), if this phone has one. */
export async function voucherFor(day: string): Promise<OfflineVoucher | null> {
  const vouchers = (await readRecord<OfflineVoucher[]>("student", VOUCHERS)) ?? [];
  return vouchers.find((voucher) => voucher.date === day) ?? null;
}

/** Drops a voucher once a time-in has used it. */
export async function forgetVoucher(jti: string): Promise<void> {
  const vouchers = (await readRecord<OfflineVoucher[]>("student", VOUCHERS)) ?? [];
  await saveRecord("student", VOUCHERS, vouchers.filter((voucher) => voucher.jti !== jti));
}

/** Signs the record of a time-in taken with no connection. Null when this phone cannot. */
export async function attestTimeIn(
  voucher: OfflineVoucher,
  photo: Blob,
  localTime: string
): Promise<{ attestation: string; signature: string } | null> {
  const install = await deviceInstall();
  if (!install) return null;
  const attestation = {
    voucher_jti: voucher.jti,
    key_id: voucher.keyId,
    photo_sha256: await sha256Hex(photo),
    local_time: localTime,
    counter: await nextCounter(),
    offset_at_issue_ms: voucher.offsetMs,
  };
  return {
    attestation: JSON.stringify(attestation),
    signature: await signWithDeviceKey(install, attestationMessage(attestation)),
  };
}

export type OfflineReadiness = {
  /** False when this browser cannot keep a key or a queued photo at all. */
  supported: boolean;
  /** The face-tracking files are on the phone. */
  filesKept: boolean;
  /** The days, "YYYY-MM-DD", this phone holds a voucher for. */
  days: string[];
};

/** How ready this phone is to time in with a photo offline, for the Profile page. */
export async function offlineReadiness(): Promise<OfflineReadiness> {
  const supported = Boolean(globalThis.crypto?.subtle) && typeof indexedDB !== "undefined" && typeof caches !== "undefined";
  if (!supported) return { supported, filesKept: false, days: [] };
  const vouchers = (await readRecord<OfflineVoucher[]>("student", VOUCHERS)) ?? [];
  return {
    supported,
    filesKept: await faceTrackerKept(),
    days: vouchers.map((voucher) => voucher.date).sort(),
  };
}
