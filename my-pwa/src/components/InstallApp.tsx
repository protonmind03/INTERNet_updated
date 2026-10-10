import { useState } from "react";
import Icon from "./Icon";
import { Button, Card, CardHeader } from "./ui";
import { useInstallPrompt } from "../lib/useInstallPrompt";

/** How to add the app on an iPhone or iPad, where there is no install button. */
function IosSteps() {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
      <li>Open this page in Safari.</li>
      <li>
        Tap the Share button (the square with an arrow pointing up) at the bottom of the screen.
      </li>
      <li>
        Scroll down and tap <span className="font-semibold">Add to Home Screen</span>, then{" "}
        <span className="font-semibold">Add</span>.
      </li>
    </ol>
  );
}

/**
 * The install entry on each Profile page. Shows an Install button where the
 * browser offers one, the Home Screen steps on an iPhone or iPad, and
 * nothing once the app is installed or where it cannot be.
 */
export default function InstallApp() {
  const { install, installed, needsIosSteps } = useInstallPrompt();
  if (installed || (!install && !needsIosSteps)) return null;

  return (
    <Card>
      <CardHeader
        title="Install INTERNet"
        description="Opens from your home screen like any other app, and keeps working when your signal drops."
      />
      <div className="px-4 pb-5 pt-3 sm:px-5">
        {install ? (
          <Button variant="secondary" icon="download" onClick={() => void install()}>
            Install on this device
          </Button>
        ) : (
          <>
            <IosSteps />
            <p className="mt-3 text-xs text-slate-500">
              On iPhone and iPad, notifications also need the app to be on the Home Screen.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

const IOS_GUIDE_DISMISSED = "inb_ios_install_dismissed";

/**
 * A small card on the sign-in page for iPhone and iPad, where the sign-in
 * page's own Install button cannot appear. Closing it is remembered.
 */
export function IosInstallGuide() {
  const { needsIosSteps } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(IOS_GUIDE_DISMISSED) === "1";
    } catch {
      return false;
    }
  });
  if (!needsIosSteps || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(IOS_GUIDE_DISMISSED, "1");
    } catch {
      /* private mode: it just shows again next time */
    }
    setDismissed(true);
  };

  return (
    <aside
      aria-label="Add INTERNet to your Home Screen"
      className="float-card fixed inset-x-4 z-(--z-push-card) mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl print:hidden"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">Add INTERNet to your Home Screen</p>
        <button
          type="button"
          aria-label="Close"
          onClick={dismiss}
          className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <Icon name="close" size={15} />
        </button>
      </div>
      <IosSteps />
    </aside>
  );
}
