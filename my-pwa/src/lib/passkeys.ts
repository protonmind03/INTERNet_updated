import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { API_URL, withStudentAuth } from "./api";

/*
|--------------------------------------------------------------------------
| PASSKEYS ON THIS PHONE
|--------------------------------------------------------------------------
|
| Iteration 22. Registering a passkey (Profile, Security and device), and
| confirming Lunch break, End break and Time out with it. A confirmation
| never stops a step (decision D7): whatever happens, the step is sent,
| with the assertion when there is one and passkey_status 'failed' when the
| prompt was cancelled or failed. With no connection, the challenge handed
| out with the day's voucher is signed on the phone (lib/offlineTimeIn.ts
| keeps them) and goes with the step when it is sent.
|
*/

export type PasskeyStep = "break" | "break-end" | "time-out";

export type PasskeyDevice = { id: number; device_label: string | null; created_at: string; last_used_at: string | null };

const STORE = "internet.passkeys.has";

/** Whether this browser can make and use a passkey with the phone's own screen lock. */
export async function passkeysAvailable(): Promise<boolean> {
  try {
    return browserSupportsWebAuthn() && (await platformAuthenticatorIsAvailable());
  } catch {
    return false;
  }
}

/** Remembered on the device: whether this trainee has a passkey (so an offline step knows to ask). */
export function rememberHasPasskey(has: boolean): void {
  try {
    if (has) localStorage.setItem(STORE, "1");
    else localStorage.removeItem(STORE);
  } catch {
    /* private mode: asked online only */
  }
}

export function hasPasskeyHere(): boolean {
  try {
    return localStorage.getItem(STORE) === "1";
  } catch {
    return false;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, withStudentAuth({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "That did not work.");
  return data as T;
}

export async function listPasskeys(): Promise<PasskeyDevice[]> {
  const response = await fetch(`${API_URL}/api/passkeys`, withStudentAuth());
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Could not load your passkeys.");
  rememberHasPasskey((data.passkeys ?? []).length > 0);
  return data.passkeys ?? [];
}

export async function registerPasskey(label: string): Promise<void> {
  const { options } = await post<{ options: PublicKeyCredentialCreationOptionsJSON }>("/api/passkeys/register/options", {});
  const response = await startRegistration({ optionsJSON: options });
  await post("/api/passkeys/register", { response, label });
  rememberHasPasskey(true);
}

export async function removePasskey(id: number): Promise<void> {
  const response = await fetch(`${API_URL}/api/passkeys/${id}`, withStudentAuth({ method: "DELETE" }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "The passkey could not be removed.");
}

/** Offline challenges the voucher came with, by day and step. */
type OfflineChallenges = Record<string, Partial<Record<PasskeyStep, PublicKeyCredentialRequestOptionsJSON>>>;
const OFFLINE = "internet.passkeys.offline";

export function keepOfflineChallenges(day: string, challenges: Partial<Record<PasskeyStep, PublicKeyCredentialRequestOptionsJSON>> | undefined): void {
  if (!challenges) return;
  try {
    const kept = JSON.parse(localStorage.getItem(OFFLINE) || "{}") as OfflineChallenges;
    kept[day] = { ...(kept[day] ?? {}), ...challenges };
    // Only the next few days are worth keeping.
    for (const key of Object.keys(kept).sort().slice(0, -4)) delete kept[key];
    localStorage.setItem(OFFLINE, JSON.stringify(kept));
  } catch {
    /* without storage, offline steps are recorded as not confirmed */
  }
}

function takeOfflineChallenge(day: string, step: PasskeyStep): PublicKeyCredentialRequestOptionsJSON | null {
  try {
    const kept = JSON.parse(localStorage.getItem(OFFLINE) || "{}") as OfflineChallenges;
    const options = kept[day]?.[step] ?? null;
    if (options) {
      delete kept[day]![step];
      localStorage.setItem(OFFLINE, JSON.stringify(kept));
    }
    return options;
  } catch {
    return null;
  }
}

/** Challenges fetched as a step's dialog opens, by step (kept up to 4 minutes; each is used once). */
const prepared = new Map<PasskeyStep, { at: number; options: Promise<PublicKeyCredentialRequestOptionsJSON | null> }>();

/** Fetches the step's challenge ahead of the tap that will use it. Does nothing without a passkey. */
export function prepareStep(step: PasskeyStep): void {
  if (!hasPasskeyHere() || typeof navigator !== "undefined" && navigator.onLine === false) return;
  const options = post<{ options: PublicKeyCredentialRequestOptionsJSON | null }>("/api/passkeys/step-challenge", { step })
    .then((data) => data.options)
    .catch(() => null);
  prepared.set(step, { at: Date.now(), options });
}

/**
 * The confirmation to send with a step: the assertion, `passkey_status:
 * "failed"`, or nothing (no passkey). Asks for the screen lock only when the
 * trainee has a passkey. Never throws.
 */
export async function confirmStep(step: PasskeyStep, day: string, online: boolean): Promise<Record<string, unknown>> {
  if (!hasPasskeyHere()) return {};
  try {
    let options: PublicKeyCredentialRequestOptionsJSON | null = null;
    if (online) {
      const ready = prepared.get(step);
      prepared.delete(step);
      options =
        ready && Date.now() - ready.at < 4 * 60_000
          ? await ready.options
          : (await post<{ options: PublicKeyCredentialRequestOptionsJSON | null }>("/api/passkeys/step-challenge", { step })).options;
      if (!options) {
        rememberHasPasskey(false);
        return {};
      }
    } else {
      options = takeOfflineChallenge(day, step);
      if (!options) return { passkey_status: "failed" };
    }
    const response = await startAuthentication({ optionsJSON: options });
    return { passkey: response };
  } catch (error) {
    // A fetch that cannot reach the server: try the offline challenge instead.
    if (online && error instanceof TypeError) return confirmStep(step, day, false);
    return { passkey_status: "failed" };
  }
}
