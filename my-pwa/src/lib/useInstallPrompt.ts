import { useSyncExternalStore } from "react";

/*
|--------------------------------------------------------------------------
| INSTALLING THE APP
|--------------------------------------------------------------------------
|
| Chrome, Edge and Android browsers announce that the app can be installed
| with one "beforeinstallprompt" event, early, and only once. It is caught
| here as soon as the app starts and kept, so any page can offer the
| install later (the sign-in page and each Profile page do).
|
| iPhone and iPad have no such event. There the person adds the app from
| Safari's Share menu, so the app can only explain how.
|
| Once installed, the browser is asked to keep the app's saved data (drafts,
| offline copies, steps waiting to be sent) and not clear it when the
| device runs short of space. The browser may still say no.
|
*/

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export type InstallState = {
  /** Shows the browser's install dialog; null when the browser has not offered one. */
  install: (() => Promise<void>) | null;
  /** The app is running from the home screen or as an installed app. */
  installed: boolean;
  /** An iPhone or iPad in the browser: installing is done from the Share menu. */
  needsIosSteps: boolean;
};

let offer: BeforeInstallPromptEvent | null = null;
let state: InstallState = read();
const listeners = new Set<() => void>();

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const agent = navigator.userAgent;
  // iPadOS reports itself as a Mac; a Mac with a touch screen is an iPad.
  return /iPad|iPhone|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
}

function read(): InstallState {
  const installed = isStandalone();
  return {
    install: offer && !installed ? promptInstall : null,
    installed,
    needsIosSteps: !installed && isIos(),
  };
}

function publish(): void {
  state = read();
  for (const listener of listeners) listener();
}

async function promptInstall(): Promise<void> {
  const event = offer;
  if (!event) return;
  await event.prompt();
  await event.userChoice.catch(() => null);
  // The browser allows one use of each offer.
  offer = null;
  publish();
}

/** Asks the browser not to clear the app's saved data. Asked once per device. */
function keepStorage(): void {
  try {
    if (localStorage.getItem("inb_storage_persist") === "1") return;
    const storage = navigator.storage;
    if (!storage?.persist) return;
    void storage.persist().then((granted) => {
      if (granted) localStorage.setItem("inb_storage_persist", "1");
    });
  } catch {
    /* Private mode, or no storage manager: nothing to ask. */
  }
}

/** Starts listening for the install offer. Call once, as early as possible. */
export function watchInstallPrompt(): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's own banner back; the app offers it in its own place.
    event.preventDefault();
    offer = event as BeforeInstallPromptEvent;
    publish();
  });
  window.addEventListener("appinstalled", () => {
    offer = null;
    publish();
    keepStorage();
  });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", publish);
  if (isStandalone()) keepStorage();
}

export function useInstallPrompt(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state
  );
}
