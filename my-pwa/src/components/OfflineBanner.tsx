import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useReportedHeight } from "../lib/layers";

/**
 * A strip across the top while the device has no connection, so a failed
 * save is not a surprise. It clears itself when the connection returns.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  // The page and its sticky headers move down by the strip's height, so it
  // never covers the header's buttons.
  const strip = useReportedHeight<HTMLDivElement>("--inb-top-inset");

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
      ref={strip}
      role="status"
      className="fixed inset-x-0 top-0 z-(--z-offline) flex animate-fade-in items-center justify-center gap-2 bg-slate-900 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-center text-sm font-medium text-white print:hidden"
    >
      <Icon name="alert" size={16} className="shrink-0 text-gold-300" />
      You're offline. Changes can't be saved until your connection is back.
    </div>
  );
}
