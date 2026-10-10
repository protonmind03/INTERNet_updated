import { useCallback, useEffect, useRef } from "react";
import { clearDraft, readDraft, saveDraft, type OfflineRole } from "./offlineStore";

/**
 * Keeps what someone is typing in a field, so a closed dialog, a reload or a
 * lost connection does not cost them the text. The draft belongs to the
 * signed-in account, lives only on this device, and is erased at sign-out.
 *
 * `name` identifies the field ("time-in-note", "task-note:42"); pass null
 * while the form is closed. When the form opens with an empty field and a
 * draft exists, the draft is put back. Call the returned function once the
 * text has been sent, to throw the draft away.
 */
export function useDraft(
  role: OfflineRole,
  name: string | null,
  value: string,
  setValue: (text: string) => void
): () => void {
  // The field whose draft has been looked up; nothing is saved before that,
  // or an empty field would wipe the draft it is about to get back.
  const ready = useRef<string | null>(null);
  const latest = useRef({ value, setValue });
  useEffect(() => {
    latest.current = { value, setValue };
  });

  useEffect(() => {
    ready.current = null;
    if (!name) return;
    let active = true;
    void readDraft(role, name).then((text) => {
      if (!active) return;
      // Only into an empty field: never over something already typed.
      if (text && !latest.current.value) latest.current.setValue(text);
      ready.current = name;
    });
    return () => {
      active = false;
    };
  }, [role, name]);

  useEffect(() => {
    if (!name) return;
    const timer = window.setTimeout(() => {
      if (ready.current === name) void saveDraft(role, name, value);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [role, name, value]);

  return useCallback(() => {
    if (name) void clearDraft(role, name);
  }, [role, name]);
}
