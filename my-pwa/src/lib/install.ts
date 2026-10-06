import { useEffect, useState } from "react";

/*
|--------------------------------------------------------------------------
| INSTALL AS AN APP
|--------------------------------------------------------------------------
|
| Browsers that can install INTERNet announce it once, early, with a
| "beforeinstallprompt" event. It is caught here as soon as the app starts
| and kept, so a page that mounts later can still offer the install button.
| Browsers without the event (Safari on iPhone) install from their own
| Share menu, and nothing is shown for them.
|
*/

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let pending: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const announce = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's own banner from appearing; the app offers its button.
    event.preventDefault();
    pending = event as InstallPromptEvent;
    announce();
  });
  window.addEventListener("appinstalled", () => {
    pending = null;
    announce();
  });
}

/** Returns a function that opens the install dialog, or null when it is not on offer. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const [available, setAvailable] = useState(pending !== null);

  useEffect(() => {
    const update = () => setAvailable(pending !== null);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  if (!available) return null;
  return async () => {
    const event = pending;
    if (!event) return;
    await event.prompt();
    await event.userChoice.catch(() => undefined);
    // A prompt can only be used once, whatever the answer.
    pending = null;
    announce();
  };
}
