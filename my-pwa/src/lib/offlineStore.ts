import { useSyncExternalStore } from "react";

/*
|--------------------------------------------------------------------------
| OFFLINE STORE
|--------------------------------------------------------------------------
|
| What the app keeps on the device so it is still useful with no
| connection. Everything is in one IndexedDB database, in three stores:
|
|   records  the last good answer to a few read-only requests (a student's
|            dashboard, attendance, schedule, tasks and notifications; a
|            supervisor's interns and review count)
|   drafts   text someone was typing and had not sent yet
|   queue    actions taken offline, waiting to be sent
|
| Every row belongs to one account ("role|id"). Signing out, an ended
| session and a forced password change erase that account's rows, so a
| shared phone does not show one person's records to the next. No photo or
| file is ever kept, and the service worker stores no API answer at all.
|
| If the browser has no IndexedDB (some private modes), every function here
| quietly does nothing and the app behaves as it did before.
|
*/

export type OfflineRole = "student" | "supervisor" | "coordinator";

const DATABASE = "internet-offline";
const VERSION = 1;
const RECORDS = "records";
const DRAFTS = "drafts";
const QUEUE = "queue";

type Row<T> = { key: string; owner: string; savedAt: string; data: T };

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of [RECORDS, DRAFTS]) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: "key" }).createIndex("owner", "owner");
          }
        }
        if (!db.objectStoreNames.contains(QUEUE)) {
          db.createObjectStore(QUEUE, { keyPath: "id", autoIncrement: true }).createIndex(
            "owner",
            "owner"
          );
        }
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

/** "role|id" for whoever is signed in as that role now, or null. */
export function currentOwner(role: OfflineRole): string | null {
  try {
    const id = localStorage.getItem(`${role}_id`);
    return id && localStorage.getItem(`${role}_token`) ? `${role}|${id}` : null;
  } catch {
    return null;
  }
}

async function put<T>(store: string, owner: string, name: string, data: T): Promise<void> {
  const db = await open();
  if (!db) return;
  const row: Row<T> = { key: `${owner}|${name}`, owner, savedAt: new Date().toISOString(), data };
  await done(db.transaction(store, "readwrite").objectStore(store).put(row));
}

async function get<T>(store: string, owner: string, name: string): Promise<Row<T> | null> {
  const db = await open();
  if (!db) return null;
  const row = await done(db.transaction(store).objectStore(store).get(`${owner}|${name}`));
  return (row as Row<T> | undefined) ?? null;
}

async function remove(store: string, owner: string, name: string): Promise<void> {
  const db = await open();
  if (!db) return;
  await done(db.transaction(store, "readwrite").objectStore(store).delete(`${owner}|${name}`));
}

/*
|--------------------------------------------------------------------------
| ERASING AN ACCOUNT'S DATA
|--------------------------------------------------------------------------
*/

/** Erases everything kept for one account: saved records, drafts and queued actions. */
export async function purgeOfflineData(role: OfflineRole, accountId: string): Promise<void> {
  const owner = `${role}|${accountId}`;
  clearSavedNotice();
  try {
    const db = await open();
    if (!db) return;
    const transaction = db.transaction([RECORDS, DRAFTS, QUEUE], "readwrite");
    for (const name of [RECORDS, DRAFTS, QUEUE]) {
      const index = transaction.objectStore(name).index("owner");
      const keys = await done(index.getAllKeys(IDBKeyRange.only(owner)));
      for (const key of keys) transaction.objectStore(name).delete(key);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch (error) {
    console.error("OFFLINE DATA PURGE ERROR:", error);
  }
}

/**
 * Erases whatever belongs to an account that is not signed in on this device
 * any more. Run when the app starts: it catches anything an interrupted
 * sign-out left behind (a closed tab, a crash, a redirect that came first).
 */
export async function purgeOrphanedOfflineData(): Promise<void> {
  try {
    const db = await open();
    if (!db) return;
    const signedIn = new Set(
      (["student", "supervisor", "coordinator"] as const)
        .map(currentOwner)
        .filter((owner): owner is string => owner !== null)
    );
    const transaction = db.transaction([RECORDS, DRAFTS, QUEUE], "readwrite");
    for (const name of [RECORDS, DRAFTS, QUEUE]) {
      const store = transaction.objectStore(name);
      const rows = (await done(store.getAll())) as Array<{ key?: string; id?: number; owner: string }>;
      for (const row of rows) {
        if (!signedIn.has(row.owner)) store.delete((row.key ?? row.id) as IDBValidKey);
      }
    }
  } catch (error) {
    console.error("OFFLINE DATA CLEAN-UP ERROR:", error);
  }
}

/*
|--------------------------------------------------------------------------
| SAVED RECORDS
|--------------------------------------------------------------------------
|
| savedFetch() is fetch() for a read-only request worth keeping. When the
| request works, its answer is saved. When the server cannot be reached and
| an earlier answer was saved, that answer is returned instead and the page
| shows "Showing saved data from <time>". A request that reaches the server
| and is refused is never replaced by a saved answer.
|
*/

const savedNames = new Map<string, string>();
const listeners = new Set<() => void>();
let oldestSaved: string | null = null;

function publish(): void {
  const times = [...savedNames.values()].sort();
  oldestSaved = times[0] ?? null;
  for (const listener of listeners) listener();
}

/** Forget what was served from saved copies; each page starts clean. */
export function clearSavedNotice(): void {
  if (savedNames.size === 0) return;
  savedNames.clear();
  publish();
}

/** When the oldest saved answer now on screen was saved, or null if all of it is live. */
export function useSavedSince(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => oldestSaved
  );
}

export async function savedFetch(
  role: OfflineRole,
  name: string,
  input: string,
  init?: RequestInit
): Promise<Response> {
  const owner = currentOwner(role);
  try {
    const response = await fetch(input, init);
    if (owner && response.ok) {
      const copy = response.clone();
      void copy
        .json()
        .then((data) => {
          // Signed out (or someone else signed in) while this was on its way.
          if (currentOwner(role) !== owner) return;
          return put(RECORDS, owner, name, data);
        })
        .catch(() => {});
    }
    if (savedNames.delete(name)) publish();
    return response;
  } catch (error) {
    // fetch() rejects with a TypeError when the server cannot be reached.
    if (!(error instanceof TypeError) || !owner) throw error;
    const row = await get<unknown>(RECORDS, owner, name).catch(() => null);
    if (!row || currentOwner(role) !== owner) throw error;
    savedNames.set(name, row.savedAt);
    publish();
    return new Response(JSON.stringify(row.data), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Saved-At": row.savedAt },
    });
  }
}

/*
|--------------------------------------------------------------------------
| DRAFTS
|--------------------------------------------------------------------------
*/

export async function saveDraft(role: OfflineRole, name: string, text: string): Promise<void> {
  const owner = currentOwner(role);
  if (!owner) return;
  try {
    if (text.trim()) await put(DRAFTS, owner, name, text);
    else await remove(DRAFTS, owner, name);
  } catch {
    /* A draft is a convenience; failing to keep one must not interrupt typing. */
  }
}

export async function readDraft(role: OfflineRole, name: string): Promise<string> {
  const owner = currentOwner(role);
  if (!owner) return "";
  try {
    const row = await get<string>(DRAFTS, owner, name);
    return typeof row?.data === "string" ? row.data : "";
  } catch {
    return "";
  }
}

export async function clearDraft(role: OfflineRole, name: string): Promise<void> {
  const owner = currentOwner(role);
  if (!owner) return;
  try {
    await remove(DRAFTS, owner, name);
  } catch {
    /* Nothing to do: the draft is overwritten the next time the field is used. */
  }
}

/*
|--------------------------------------------------------------------------
| QUEUED ACTIONS
|--------------------------------------------------------------------------
*/

export type QueuedAction<T> = { id: number; owner: string; savedAt: string; data: T };

export async function enqueue<T>(role: OfflineRole, data: T): Promise<number | null> {
  const owner = currentOwner(role);
  const db = await open();
  if (!owner || !db) return null;
  const id = await done(
    db
      .transaction(QUEUE, "readwrite")
      .objectStore(QUEUE)
      .add({ owner, savedAt: new Date().toISOString(), data })
  );
  return Number(id);
}

export async function queued<T>(role: OfflineRole): Promise<QueuedAction<T>[]> {
  const owner = currentOwner(role);
  const db = await open();
  if (!owner || !db) return [];
  const rows = await done(
    db.transaction(QUEUE).objectStore(QUEUE).index("owner").getAll(IDBKeyRange.only(owner))
  );
  return (rows as QueuedAction<T>[]).sort((a, b) => a.id - b.id);
}

export async function dequeue(id: number): Promise<void> {
  const db = await open();
  if (!db) return;
  await done(db.transaction(QUEUE, "readwrite").objectStore(QUEUE).delete(id));
}
