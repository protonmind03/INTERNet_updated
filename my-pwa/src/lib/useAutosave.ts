import { useCallback, useEffect, useRef, useState } from "react";
import { readRecord, saveRecord, type OfflineRole } from "./offlineStore";

/*
|--------------------------------------------------------------------------
| SAVING AS YOU GO (revisions, November 2026)
|--------------------------------------------------------------------------
|
| The trainee's reports, feedback form and narrative report save
| themselves: a moment after they stop typing, what changed is sent. Until
| the server has it, a copy waits on this phone (lib/offlineStore.ts, under
| the signed-in account), so a closed tab or a lost connection costs
| nothing; when the phone is back online it is sent again. `restore`
| returns that waiting copy, for a form that opens before it was sent.
|
| The state, for a quiet line beside the form ("Saving…", "Saved",
| "Saved on this phone, will send when online", "Couldn't save"):
|
|   idle      nothing changed since it opened
|   saving    being sent
|   saved     the server has the latest
|   waiting   no connection: kept on the phone, sent once back online
|   error     the server refused it; `message` says why
|
*/

export type SaveState = "idle" | "saving" | "saved" | "waiting" | "error";

type Pending<T> = { value: T; at: string };

export async function restoreAutosave<T>(role: OfflineRole, key: string): Promise<T | null> {
  const pending = await readRecord<Pending<T>>(role, `autosave:${key}`).catch(() => null);
  return pending ? pending.value : null;
}

export function useAutosave<T>({
  role,
  key,
  value,
  save,
  enabled = true,
  delay = 1200,
}: {
  role: OfflineRole;
  /** What this form is ("daily-report:2026-11-08"); null while nothing is open. */
  key: string | null;
  value: T;
  /** Sends the value; throws an Error with the server's words when refused. */
  save: (value: T) => Promise<void>;
  /** False until the form has its starting value, so the start is not sent back. */
  enabled?: boolean;
  delay?: number;
}): { state: SaveState; message: string; flush: () => Promise<void>; savedAt: Date | null } {
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const baseline = useRef<string | null>(null);
  const latest = useRef({ value, save, key });
  useEffect(() => {
    latest.current = { value, save, key };
  });

  // The value the form opened with is not a change.
  useEffect(() => {
    baseline.current = enabled ? JSON.stringify(value) : null;
    void Promise.resolve().then(() => setState("idle"));
    // Only when the form (key) opens or becomes ready, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const send = useCallback(async () => {
    const { value: current, save: sendIt, key: name } = latest.current;
    if (!name) return;
    const text = JSON.stringify(current);
    if (text === baseline.current) return;
    setState("saving");
    try {
      await sendIt(current);
      baseline.current = text;
      setSavedAt(new Date());
      setMessage("");
      setState("saved");
      await saveRecord(role, `autosave:${name}`, null).catch(() => undefined);
    } catch (error) {
      if (!navigator.onLine || error instanceof TypeError) {
        setState("waiting");
        setMessage("");
      } else {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Couldn't save.");
      }
    }
  }, [role]);

  // A moment after the last change: kept on the phone at once, sent after the pause.
  useEffect(() => {
    if (!enabled || !key) return;
    const text = JSON.stringify(value);
    if (text === baseline.current) return;
    void saveRecord<Pending<T>>(role, `autosave:${key}`, { value, at: new Date().toISOString() }).catch(() => undefined);
    const timer = window.setTimeout(() => void send(), delay);
    return () => window.clearTimeout(timer);
  }, [role, key, value, enabled, delay, send]);

  // Back online: whatever waited is sent.
  useEffect(() => {
    const online = () => void send();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [send]);

  return { state, message, flush: send, savedAt };
}

/** The quiet words for a save state. */
export function saveStateText(state: SaveState, message: string): string {
  if (state === "saving") return "Saving…";
  if (state === "saved") return "All changes saved";
  if (state === "waiting") return "Saved on this phone. It will be sent when you're back online.";
  if (state === "error") return message || "Couldn't save. Try again.";
  return "";
}
