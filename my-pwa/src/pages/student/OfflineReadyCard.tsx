import { useEffect, useState } from "react";
import { Card } from "../../components/ui";
import { formatPhDay, phToday } from "../../lib/phTime";
import { precacheFaceTracker } from "../../lib/liveness/trackerFiles";
import { offlineReadiness, prepareOfflineTimeIn, type OfflineReadiness } from "../../lib/offlineTimeIn";
import { useOnline } from "../../lib/useOnline";

/*
|--------------------------------------------------------------------------
| TIMING IN WITH NO SIGNAL: IS THIS PHONE READY?
|--------------------------------------------------------------------------
|
| Says plainly whether this phone can time in with a photo when there is no
| connection (lib/offlineTimeIn.ts), and if not, why. Getting ready happens
| by itself while the phone is online; this only reports it.
|
*/

function dayName(day: string): string {
  return day === phToday() ? "today" : formatPhDay(day, { weekday: "short", month: "short", day: "numeric" });
}

export default function OfflineReadyCard({ studentId }: { studentId: string }) {
  const online = useOnline();
  const [state, setState] = useState<OfflineReadiness | null>(null);

  useEffect(() => {
    let current = true;
    const check = () =>
      void offlineReadiness().then((next) => {
        if (current) setState(next);
      });
    check();
    // While online, finish getting ready, then look again.
    if (online) void Promise.all([prepareOfflineTimeIn(studentId), precacheFaceTracker()]).then(check);
    return () => {
      current = false;
    };
  }, [studentId, online]);

  if (!state) return null;
  const ready = state.supported && state.filesKept && state.days.length > 0;
  let detail: string;
  if (!state.supported) {
    detail = "This browser cannot keep a time-in with a photo. With no signal you can still time in without one.";
  } else if (ready) {
    const days = state.days.map(dayName);
    detail = `With no signal, you can still time in with your photo ${days.join(" and ")}. It is sent when you are back online.`;
  } else if (!state.filesKept) {
    detail = online
      ? "Getting ready: the face-check files (about 13 MB) are downloading. Until then, with no signal you can time in without a photo."
      : "Not ready yet: the face-check files (about 13 MB) download the next time this phone is online. Until then, with no signal you can time in without a photo.";
  } else {
    detail = "No scheduled day is coming up, so there is nothing to get ready for. With no signal you can time in without a photo.";
  }

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-900">Timing in with no signal</h2>
      <p className="mt-1 text-sm text-slate-600" role="status">
        <span className={`font-semibold ${ready ? "text-emerald-700" : "text-slate-800"}`}>{ready ? "Ready. " : ""}</span>
        {detail}
      </p>
    </Card>
  );
}
