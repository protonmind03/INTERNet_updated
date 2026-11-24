import { useEffect, useState } from "react";
import Icon from "./Icon";
import { onSystemNotice, readSystemNotice, storedSystemNotice, type SystemNotice } from "../lib/systemNotice";

/*
| Phase 1.7: the system administrator's maintenance notice, at the top of
| every portal (RoleShell draws it). It is read when a portal opens and
| again every ten minutes; offline, the copy kept on the device shows.
*/

const REFRESH_MS = 10 * 60_000;

export default function SystemNoticeBanner() {
  const [notice, setNotice] = useState<SystemNotice>(() => storedSystemNotice());

  useEffect(() => {
    let live = true;
    const read = () => void readSystemNotice().then((next) => live && setNotice(next));
    read();
    const timer = window.setInterval(read, REFRESH_MS);
    const stop = onSystemNotice((next) => setNotice(next));
    return () => {
      live = false;
      window.clearInterval(timer);
      stop();
    };
  }, []);

  if (!notice) return null;
  return (
    <div role="status" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 md:px-8 print:hidden">
      <Icon name="megaphone" size={16} className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1 break-words">{notice.message}</p>
    </div>
  );
}
