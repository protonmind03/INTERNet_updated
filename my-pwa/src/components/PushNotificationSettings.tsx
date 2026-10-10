import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { API_URL, withRoleAuth } from "../lib/api";
import { BrandLoader } from "../brand";
import { useReportedHeight } from "../lib/layers";
import { toast } from "../lib/toast";
import { useInstallPrompt } from "../lib/useInstallPrompt";

type Role = "coordinator" | "student" | "supervisor";

function currentRole(path: string): { role: Role; token: string } | null {
  if (path === "/" || path.startsWith("/forgot-password") || path.startsWith("/reset-password")) {
    return null;
  }
  const pathRole = path.startsWith("/coordinator")
    ? "coordinator"
    : path.startsWith("/supervisor")
      ? "supervisor"
      : path === "/notifications" || path.startsWith("/student")
        ? "student"
        : null;
  if (pathRole) {
    const token = localStorage.getItem(`${pathRole}_token`);
    return token ? { role: pathRole, token } : null;
  }
  const activeRole = localStorage.getItem("active_role");
  if (
    (activeRole === "student" ||
      activeRole === "supervisor" ||
      activeRole === "coordinator") &&
    localStorage.getItem(`${activeRole}_token`)
  ) {
    return {
      role: activeRole,
      token: localStorage.getItem(`${activeRole}_token`)!,
    };
  }
  for (const role of ["student", "supervisor", "coordinator"] as const) {
    const token = localStorage.getItem(`${role}_token`);
    if (token) return { role, token };
  }
  return null;
}

const DISMISSED_KEY = "push_prompt_dismissed";

function decodeVapidKey(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes.buffer;
}

export default function PushNotificationSettings() {
  const location = useLocation();
  const [identity, setIdentity] = useState<ReturnType<typeof currentRole>>(null);
  // Dismissing the prompt is remembered on this device, so it does not
  // come back on every page.
  // Toasts rest above this card while it shows (8 px between them).
  const card = useReportedHeight<HTMLElement>("--inb-push-card", 8);
  const { needsIosSteps } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === "1"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(false);
  // Null until the server says whether push is set up at all.
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/push/vapid-public-key`)
      .then((response) => {
        if (active) setAvailable(response.ok);
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  useEffect(() => {
    const updateIdentity = () => {
      setIdentity(currentRole(location.pathname));
    };
    updateIdentity();
    window.addEventListener("storage", updateIdentity);
    window.addEventListener("internet-auth-changed", updateIdentity);
    window.addEventListener("popstate", updateIdentity);
    return () => {
      window.removeEventListener("storage", updateIdentity);
      window.removeEventListener("internet-auth-changed", updateIdentity);
      window.removeEventListener("popstate", updateIdentity);
    };
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    if (!identity || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return;
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setEnabled(Boolean(subscription));
      })
      .catch((subscriptionError: unknown) => {
        console.error("CHECK PUSH SUBSCRIPTION ERROR:", subscriptionError);
        if (active) setError("Could not check this device's notification settings.");
      });
    return () => {
      active = false;
    };
  }, [identity]);

  const enable = async () => {
    if (!identity) return;
    setBusy(true);
    setError("");
    try {
      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
      if (permission !== "granted") {
        throw new Error(
          permission === "denied"
            ? "Browser notifications are blocked. Allow them in this site's browser settings, then try again."
            : "Browser notification permission was not granted."
        );
      }

      const keyResponse = await fetch(`${API_URL}/api/push/vapid-public-key`);
      const keyData = await keyResponse.json();
      if (!keyResponse.ok) {
        throw new Error(keyData.message || "Browser push notifications are unavailable.");
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(keyData.publicKey),
        }));
      const response = await fetch(
        `${API_URL}/api/push/subscriptions`,
        withRoleAuth(identity.role, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        })
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Could not enable browser notifications.");
      }
      setEnabled(true);
      toast.success("Notifications are on for this device.");
    } catch (enableError) {
      console.error("ENABLE PUSH NOTIFICATIONS ERROR:", enableError);
      setError(
        enableError instanceof Error
          ? enableError.message
          : "Could not enable browser notifications."
      );
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!identity) return;
    setBusy(true);
    setError("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setEnabled(false);
        return;
      }
      const response = await fetch(
        `${API_URL}/api/push/subscriptions`,
        withRoleAuth(identity.role, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Could not disable browser notifications.");
      }
      const unsubscribed = await subscription.unsubscribe();
      if (!unsubscribed) {
        throw new Error("The browser could not remove this device's subscription.");
      }
      setEnabled(false);
      toast.success("Notifications are off for this device.");
    } catch (disableError) {
      console.error("DISABLE PUSH NOTIFICATIONS ERROR:", disableError);
      setError(
        disableError instanceof Error
          ? disableError.message
          : "Could not disable browser notifications."
      );
    } finally {
      setBusy(false);
    }
  };

  // iPhone and iPad only allow notifications for an app on the Home Screen.
  // In the browser there is nothing to turn on, so say what to do instead.
  if (identity && !dismissed && available && needsIosSteps && !("PushManager" in window)) {
    return (
      <aside
        aria-label="Notifications on iPhone and iPad"
        ref={card}
        className="float-card print:hidden fixed right-4 z-(--z-push-card) w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Want notifications on this phone?</p>
            <p className="mt-1 text-xs text-slate-600">
              On iPhone and iPad they work only after INTERNet is added to the Home Screen. In
              Safari, tap Share, then Add to Home Screen. Open INTERNet from there and you
              will be asked again.
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismiss}
            className="text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        </div>
      </aside>
    );
  }

  // The prompt is an invitation, so it only appears when push can actually
  // be turned on and this device has not answered yet.
  if (
    !identity ||
    dismissed ||
    !available ||
    (enabled && !error) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return null;
  }

  return (
    <aside
      aria-label="Browser notification settings"
      ref={card}
      className="float-card print:hidden fixed right-4 z-(--z-push-card) w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {enabled ? "Browser notifications enabled" : "Get browser notifications"}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {enabled
              ? "This device can receive INTERNet updates while the app is in the background."
              : "Receive important INTERNet updates even when this page is in the background."}
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss browser notification prompt"
          onClick={dismiss}
          className="text-slate-400 hover:text-slate-700"
        >
          ×
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-700">
          {error}
        </p>
      )}
      {enabled ? (
        <button
          type="button"
          disabled={busy}
          onClick={disable}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy && <BrandLoader variant="button" process="save" />}
          {busy ? "Disabling" : "Disable on this device"}
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={enable}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-psu-700 px-3 py-2 text-sm font-semibold text-white hover:bg-psu-800 disabled:opacity-60"
        >
          {busy && <BrandLoader variant="button" process="save" />}
          {busy ? "Enabling" : "Enable on this device"}
        </button>
      )}
    </aside>
  );
}
