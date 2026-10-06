import { useEffect, useState } from "react";
import Icon from "./Icon";

/**
 * A strip across the top while the device has no connection, so a failed
 * save is not a surprise. It clears itself when the connection returns.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[80] flex animate-fade-in items-center justify-center gap-2 bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white print:hidden"
    >
      <Icon name="alert" size={16} className="shrink-0 text-gold-300" />
      You're offline. Changes can't be saved until your connection is back.
    </div>
  );
}
