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
| A "working" toast stays until it is updated or dismissed. It is for slow
| work that has no button of its own to show progress on.
|
*/

export type ToastTone = "working" | "success" | "error" | "info";

export type ToastAction = { label: string; onClick: () => void };

export type ToastMessage = {
  id: number;
  tone: ToastTone;
  text: string;
  /** A second, quieter line: the body of a notification under its title. */
  detail?: string;
  action?: ToastAction;
  /** A brand moment: the success icon is the graduation cap. */
  celebrate?: boolean;
  /** Milliseconds until it closes by itself; 0 for a working toast. */
  lifetime: number;
};

type Listener = (messages: ToastMessage[]) => void;

let messages: ToastMessage[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const timers = new Map<number, number>();

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
  window.clearTimeout(timers.get(id));
  timers.delete(id);
  messages = messages.filter((message) => message.id !== id);
  emit();
}

function lifetimeFor(tone: ToastTone, action?: ToastAction): number {
  if (tone === "working") return 0;
  return action ? 8000 : tone === "error" ? 7000 : 4000;
}

function arm(id: number, lifetime: number): void {
  window.clearTimeout(timers.get(id));
  timers.delete(id);
  if (lifetime > 0) timers.set(id, window.setTimeout(() => dismissToast(id), lifetime));
}

function show(
  tone: ToastTone,
  text: string,
  action?: ToastAction,
  celebrate = false,
  detail?: string
): number {
  const id = nextId++;
  const lifetime = lifetimeFor(tone, action);
  // Keep the stack short; the oldest message gives way to the newest.
  messages = [...messages.slice(-2), { id, tone, text, detail, action, celebrate, lifetime }];
  emit();
  arm(id, lifetime);
  return id;
}

/** Turns a toast (usually a working one) into its outcome, in place. */
function update(id: number, tone: ToastTone, text: string): void {
  if (!messages.some((message) => message.id === id)) {
    show(tone, text);
    return;
  }
  const lifetime = lifetimeFor(tone);
  messages = messages.map((message) =>
    message.id === id
      ? { ...message, tone, text, detail: undefined, action: undefined, lifetime }
      : message
  );
  emit();
  arm(id, lifetime);
}

export const toast = {
  success: (text: string, action?: ToastAction) => {
    show("success", text, action);
  },
  /** Success on a brand moment, such as timing in or submitting a task. */
  celebrate: (text: string) => {
    show("success", text, undefined, true);
  },
  error: (text: string) => {
    show("error", text);
  },
  info: (text: string) => {
    show("info", text);
  },
  /** A notification that just arrived: its title, its message, and a way to open it. */
  notice: (title: string, detail: string, action?: ToastAction) => {
    show("info", title, action, false, detail);
  },
  working: (text: string) => show("working", text),
  update,
};

/**
 * Runs slow work that has no busy button of its own. The working toast only
 * appears when the work takes long enough to notice, and goes when it ends;
 * the caller still reports the outcome.
 */
export async function withWorkingToast<T>(text: string, work: () => Promise<T>): Promise<T> {
  let id = 0;
  const slow = window.setTimeout(() => {
    id = toast.working(text);
  }, 450);
  try {
    return await work();
  } finally {
    window.clearTimeout(slow);
    if (id) dismissToast(id);
  }
}

/** The message to show for a caught error. */
export function errorText(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    // fetch() rejects with a TypeError when the server cannot be reached.
    return "Can't reach the server. Check your connection and try again.";
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
