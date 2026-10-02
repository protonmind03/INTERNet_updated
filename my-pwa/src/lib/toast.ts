/*
|--------------------------------------------------------------------------
| TOAST MESSAGES
|--------------------------------------------------------------------------
|
| Short confirmations and errors shown at the edge of the screen, in place
| of the browser's blocking alert() box. Call `toast.success(...)` or
| `toast.error(...)` from anywhere; <Toaster /> in App renders them.
|
| A toast can carry one action, used for "Undo": the message stays a little
| longer so there is time to press it.
|
*/

export type ToastTone = "success" | "error" | "info";

export type ToastAction = { label: string; onClick: () => void };

export type ToastMessage = {
  id: number;
  tone: ToastTone;
  text: string;
  action?: ToastAction;
};

type Listener = (messages: ToastMessage[]) => void;

let messages: ToastMessage[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(messages);
}

export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(messages);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissToast(id: number): void {
  messages = messages.filter((message) => message.id !== id);
  emit();
}

function show(tone: ToastTone, text: string, action?: ToastAction): void {
  const id = nextId++;
  // Keep the stack short; the oldest message gives way to the newest.
  messages = [...messages.slice(-2), { id, tone, text, action }];
  emit();
  const lifetime = action ? 8000 : tone === "error" ? 7000 : 4000;
  window.setTimeout(() => dismissToast(id), lifetime);
}

export const toast = {
  success: (text: string, action?: ToastAction) => show("success", text, action),
  error: (text: string) => show("error", text),
  info: (text: string) => show("info", text),
};

/** The message to show for a caught error. */
export function errorText(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    // fetch() rejects with a TypeError when the server cannot be reached.
    return "Can't reach the server. Check your connection and try again.";
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
