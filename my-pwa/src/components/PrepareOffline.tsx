import { useState } from "react";
import { precacheFaceTracker } from "../lib/liveness/trackerFiles";
import { offlineReadiness, prepareOfflineTimeIn } from "../lib/offlineTimeIn";
import { useAccount } from "../lib/session";
import { useOnline } from "../lib/useOnline";
import { Button } from "./ui";

/*
| Phase 1.8: the onboarding's "Prepare for offline" step. Downloads the
| face-check files (about 13 MB) and this phone's signed passes for timing
| in with no connection, with a progress bar, so the first day without a
| signal is not the day they are missing. The same work also happens by
| itself when a trainee signs in (lib/offlineTimeIn.ts); this does it now,
| in the open, ideally on Wi-Fi.
*/

const STEPS = 4; // three face-check files, then the passes

export default function PrepareOffline() {
  const student = useAccount("student");
  const online = useOnline();
  const [done, setDone] = useState(0);
  const [state, setState] = useState<"idle" | "busy" | "ready" | "partial">("idle");
  const [summary, setSummary] = useState("");

  const prepare = async () => {
    if (!student) return;
    setState("busy");
    setDone(0);
    const filesKept = await precacheFaceTracker((kept, total) => setDone(Math.round((kept / total) * (STEPS - 1))));
    setDone(STEPS - 1);
    await prepareOfflineTimeIn(student.student_id, true);
    setDone(STEPS);
    const readiness = await offlineReadiness();
    if (filesKept && readiness.supported && readiness.filesKept && readiness.days.length > 0) {
      setState("ready");
      setSummary("Ready. With no signal you can time in with your photo; it is sent when you are back online.");
    } else {
      setState("partial");
      setSummary(
        !readiness.supported
          ? "This browser cannot keep a time-in with a photo. With no signal you can still time in without one."
          : !filesKept || !readiness.filesKept
            ? "The face-check files did not finish. Try again on Wi-Fi; until then, with no signal you can time in without a photo."
            : "The files are kept. No scheduled day is coming up yet, so there is no pass to keep; it comes with your schedule."
      );
    }
  };

  const percent = Math.round((done / STEPS) * 100);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={() => void prepare()} disabled={!online || state === "busy"}>
        {state === "ready" ? "Prepare again" : "Prepare now"}
      </Button>
      {state !== "idle" && (
        <div
          role="progressbar"
          aria-label="Preparing for offline"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 w-full overflow-hidden rounded-full bg-(--land-line)"
        >
          <div className="h-full origin-left bg-(--role-primary) transition-transform duration-300 motion-reduce:transition-none" style={{ transform: `scaleX(${done / STEPS})` }} />
        </div>
      )}
      <p className="m-0 text-[13px] text-(--land-muted)" role="status">
        {state === "busy"
          ? `Downloading: ${percent}%.`
          : state === "idle"
            ? online
              ? "About 13 MB. Recommended on Wi-Fi."
              : "Needs a connection. It also happens by itself the next time this phone is online."
            : summary}
      </p>
    </div>
  );
}
