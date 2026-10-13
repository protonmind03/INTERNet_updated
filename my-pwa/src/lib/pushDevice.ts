import { API_URL, withRoleAuth } from "./api";

/*
|--------------------------------------------------------------------------
| PUSH NOTIFICATIONS ON THIS DEVICE
|--------------------------------------------------------------------------
|
| Turning push on means three things agree: the browser has given
| permission, the browser holds a subscription made with the server's
| current key, and the server has that subscription stored for the
| signed-in account. The functions here keep the three together. They are
| used by the prompt that invites someone to turn notifications on and by
| the "This device" line in Profile, so both always say the same thing.
|
| Each function throws an Error whose message is a plain sentence that can
| be shown as it is.
|
*/

export type PushRole = "coordinator" | "student" | "supervisor";

/** Sent whenever this device's push is turned on or off, so every place showing it updates. */
export const PUSH_CHANGED = "internet-push-changed";

function changed(): void {
  window.dispatchEvent(new Event(PUSH_CHANGED));
}

/** Whether this browser can receive push notifications at all. */
export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function decodeKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** The server's public key, or null when push is not set up on the server (or it cannot be reached). */
export async function serverPushKey(): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/api/push/vapid-public-key`);
    if (!response.ok) return null;
    const data = (await response.json()) as { publicKey?: unknown };
    return typeof data.publicKey === "string" && data.publicKey ? data.publicKey : null;
  } catch {
    return null;
  }
}

/** The subscription this browser holds, if any. */
export async function deviceSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** True when the subscription was made with this key. A browser that does not say is taken at its word. */
function madeWith(subscription: PushSubscription, key: Uint8Array): boolean {
  const used = subscription.options?.applicationServerKey;
  if (!used) return true;
  const bytes = new Uint8Array(used);
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index]);
}

async function store(role: PushRole, subscription: PushSubscription): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/push/subscriptions`,
    withRoleAuth(role, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    })
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: unknown };
    throw new Error(
      typeof data.message === "string" ? data.message : "Notifications could not be turned on."
    );
  }
}

async function subscribe(key: Uint8Array<ArrayBuffer>): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

/** Asks for permission if needed, subscribes this browser and stores the subscription for the account. */
export async function enablePush(role: PushRole): Promise<void> {
  if (!pushSupported()) throw new Error("This browser cannot receive notifications.");
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site. Allow them in the browser's site settings, then try again."
        : "Permission for notifications was not given."
    );
  }
  const publicKey = await serverPushKey();
  if (!publicKey) throw new Error("Notifications to devices are not available right now.");
  const key = decodeKey(publicKey);

  let subscription = await deviceSubscription();
  // Made with a key the server no longer uses: nothing sent to it would arrive.
  if (subscription && !madeWith(subscription, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await subscribe(key);
  await store(role, subscription);
  changed();
}

/** Removes this browser's subscription, here and on the server. */
export async function disablePush(role: PushRole): Promise<void> {
  const subscription = await deviceSubscription();
  if (!subscription) {
    changed();
    return;
  }
  const response = await fetch(
    `${API_URL}/api/push/subscriptions`,
    withRoleAuth(role, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: unknown };
    throw new Error(
      typeof data.message === "string" ? data.message : "Notifications could not be turned off."
    );
  }
  if (!(await subscription.unsubscribe())) {
    throw new Error("The browser could not remove this device's subscription.");
  }
  changed();
}

/**
 * Run when the app opens. If this browser's subscription was made with a
 * key the server has since replaced, it is made again with the current
 * one, without asking: permission was already given. Returns whether push
 * is on for this device afterwards.
 */
export async function refreshPush(role: PushRole): Promise<boolean> {
  const subscription = await deviceSubscription();
  if (!subscription) return false;
  const publicKey = await serverPushKey();
  // Push is off on the server, or it cannot be reached: leave things as they are.
  if (!publicKey) return true;
  const key = decodeKey(publicKey);
  if (madeWith(subscription, key)) return true;
  // The server forgets the old one too, or it would keep trying it. Best effort.
  await fetch(
    `${API_URL}/api/push/subscriptions`,
    withRoleAuth(role, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
  ).catch(() => undefined);
  await subscription.unsubscribe();
  if (Notification.permission !== "granted") {
    changed();
    return false;
  }
  await store(role, await subscribe(key));
  changed();
  return true;
}

/** Asks the server to send one notification to the account's devices. Returns what it answered. */
export async function sendTestPush(role: PushRole): Promise<string> {
  const response = await fetch(`${API_URL}/api/push/test`, withRoleAuth(role, { method: "POST" }));
  const data = (await response.json().catch(() => ({}))) as { message?: unknown };
  const message = typeof data.message === "string" ? data.message : "";
  if (!response.ok) throw new Error(message || "The test notification could not be sent.");
  return message || "A test notification was sent.";
}
