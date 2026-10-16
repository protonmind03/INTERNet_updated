/*
|--------------------------------------------------------------------------
| THIS PHONE'S KEY
|--------------------------------------------------------------------------
|
| An ECDSA P-256 key made with WebCrypto the first time a student prepares
| this install for offline time-in. Its private half is created
| non-extractable: the browser can sign with it but will never hand it
| out, not even to this app. Its public half is registered with the server
| for each student who uses this install.
|
| It signs the record of a time-in taken with no connection
| (lib/offlineTimeIn.ts), with a counter that only goes up, so the server
| can tell the record came from this install and was not sent twice.
|
| It is kept in its own IndexedDB database, apart from the per-account data
| in lib/offlineStore.ts: signing out does not erase it, because it belongs
| to the install, not to the account. Clearing the site's data does.
|
*/

const DATABASE = "internet-device";
const STORE = "install";
const KEY = "key";

export type DeviceInstall = {
  privateKey: CryptoKey;
  publicJwk: { kty: string; crv: string; x: string; y: string };
  /** The last counter used in a signed record. */
  counter: number;
  /** The key's id on the server, per student it was registered for. */
  registered: Record<string, string>;
};

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function read(): Promise<DeviceInstall | null> {
  const db = await open();
  if (!db) return null;
  return ((await done(db.transaction(STORE).objectStore(STORE).get(KEY))) as DeviceInstall | undefined) ?? null;
}

async function write(install: DeviceInstall): Promise<void> {
  const db = await open();
  if (db) await done(db.transaction(STORE, "readwrite").objectStore(STORE).put(install, KEY));
}

/** This install's key, made the first time it is asked for. Null when the browser cannot keep one. */
export async function deviceInstall(): Promise<DeviceInstall | null> {
  try {
    if (!globalThis.crypto?.subtle || typeof indexedDB === "undefined") return null;
    const existing = await read();
    if (existing) return existing;
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const install: DeviceInstall = {
      privateKey: pair.privateKey,
      publicJwk: { kty: String(jwk.kty), crv: String(jwk.crv), x: String(jwk.x), y: String(jwk.y) },
      counter: 0,
      registered: {},
    };
    // Two tabs at once: the first key written is the one kept.
    const db = await open();
    if (!db) return null;
    try {
      await done(db.transaction(STORE, "readwrite").objectStore(STORE).add(install, KEY));
      return install;
    } catch {
      return await read();
    }
  } catch {
    return null;
  }
}

/** Remembers (or forgets, with null) the key's id on the server for one student. */
export async function rememberRegistration(studentId: string, keyId: string | null): Promise<void> {
  const install = await read();
  if (!install) return;
  const registered = { ...install.registered };
  if (keyId) registered[studentId] = keyId;
  else delete registered[studentId];
  await write({ ...install, registered });
}

/** The next counter, kept before it is used: a number is never signed twice. */
export async function nextCounter(): Promise<number> {
  const db = await open();
  if (!db) throw new Error("This phone cannot keep a counter.");
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const request = store.get(KEY);
    let next = 0;
    request.onsuccess = () => {
      const install = request.result as DeviceInstall | undefined;
      if (!install) return reject(new Error("This phone has no key."));
      next = install.counter + 1;
      store.put({ ...install, counter: next }, KEY);
    };
    transaction.oncomplete = () => resolve(next);
    transaction.onerror = () => reject(transaction.error);
  });
}

function base64url(bytes: ArrayBuffer): string {
  let text = "";
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Signs text with this install's key: raw r||s, base64url, as the server reads it. */
export async function signWithDeviceKey(install: DeviceInstall, message: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    install.privateKey,
    new TextEncoder().encode(message)
  );
  return base64url(signature);
}

/** SHA-256 of a file, as lowercase hex. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
