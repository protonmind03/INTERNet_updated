import { API_URL } from "./api";

/*
| The maintenance notice (Phase 1.7, migration 081): one line the system
| administrator shows at the top of every portal. It holds nothing
| personal, so it is kept in localStorage for reading offline, apart from
| the per-account offline store, and it survives a sign-out.
*/

export type SystemNotice = { message: string; updated_at: string } | null;

const KEY = "inb_system_notice";
const EVENT = "internet-system-notice";

/** The notice as last read on this device. */
export function storedSystemNotice(): SystemNotice {
  try {
    const saved = localStorage.getItem(KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as SystemNotice;
    return parsed && typeof parsed.message === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Keeps the notice on this device and tells every banner on the page. */
export function rememberSystemNotice(notice: SystemNotice): void {
  try {
    if (notice) localStorage.setItem(KEY, JSON.stringify(notice));
    else localStorage.removeItem(KEY);
  } catch {
    /* Storage refused: the banner still shows what the server said. */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: notice }));
}

/** Reads the notice from the server and keeps it; offline, the kept copy. */
export async function readSystemNotice(): Promise<SystemNotice> {
  try {
    const response = await fetch(`${API_URL}/api/system-notice`);
    if (!response.ok) return storedSystemNotice();
    const data = (await response.json()) as { notice: SystemNotice };
    rememberSystemNotice(data.notice ?? null);
    return data.notice ?? null;
  } catch {
    return storedSystemNotice();
  }
}

/** Calls back whenever the notice changes on this page. */
export function onSystemNotice(listener: (notice: SystemNotice) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<SystemNotice>).detail ?? null);
  window.addEventListener(EVENT, handle);
  return () => window.removeEventListener(EVENT, handle);
}
