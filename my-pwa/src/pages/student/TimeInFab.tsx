import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Icon from "../../components/Icon";
import { useReportedHeight } from "../../lib/layers";
import { toast } from "../../lib/toast";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { nextStep, OFFLINE_TIME_IN } from "./nextStep";
import { useTimeIn } from "./timeInContext";

/*
|--------------------------------------------------------------------------
| THE FLOATING NEXT-STEP BUTTON (phones)
|--------------------------------------------------------------------------
|
| On a phone the thing a student came to do is one tap away on every page:
| Time in, then Lunch, Back, Time out. It opens the same dialogs as the
| Attendance card. It stays out of the way where it is not wanted: on the
| Attendance page (the full card is there), on Profile, while any dialog
| or sheet is open, and once the day is done.
|
| It sits above the tab bar on its own layer (--z-fab) and publishes its
| height as --inb-fab, so toasts and the push prompt rise above it. See
| "Fixed layers" in index.css.
|
*/

/** Pages where the button is not shown. */
const HIDDEN_ON = ["/daily-log", "/profile"];

/** True while a dialog, sheet or menu sheet is on screen, whoever opened it. */
function useDialogOnScreen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => setOpen(document.querySelector('[role="dialog"]') !== null);
    check();
    // Dialogs are added to and removed from the page; nothing else is watched.
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return open;
}

export default function TimeInFab() {
  const timeIn = useTimeIn();
  const { pathname } = useLocation();
  const dialogOnScreen = useDialogOnScreen();
  // Phones only. On a wide screen the page header has the button, and this
  // one is not on the page at all, so the step is never offered twice.
  const phone = useMediaQuery("(max-width: 767px)");
  // Its height plus the gap above it, for whatever floats over that corner.
  const report = useReportedHeight<HTMLButtonElement>("--inb-fab", 12);

  const { stage, loading, busy, todayLog } = timeIn.attendance;
  const step = loading ? null : nextStep(stage);
  if (!phone || !step || HIDDEN_ON.includes(pathname) || dialogOnScreen || timeIn.dialogOpen) return null;

  const offline = stage === "not-started" && !timeIn.online;
  const waiting = todayLog?.waiting?.length ?? 0;

  return (
    <button
      ref={report}
      type="button"
      disabled={busy}
      aria-label={
        waiting > 0
          ? `${step.name}. ${waiting === 1 ? "1 step is" : `${waiting} steps are`} waiting to be sent.`
          : step.name
      }
      // Looks unavailable but still answers a tap, to say why.
      aria-disabled={offline || undefined}
      onClick={() => (offline ? toast.info(OFFLINE_TIME_IN) : step.run(timeIn))}
      className={`float-fab inb-press fixed right-4 z-(--z-fab) flex h-14 min-w-14 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold shadow-lg shadow-psu-950/25 ring-1 ring-inset ring-black/5 md:hidden print:hidden ${
        offline ? "bg-slate-200 text-slate-600" : "bg-gold-400 text-psu-950"
      }`}
    >
      <Icon name={step.icon} size={22} />
      <span>{step.label}</span>
      {waiting > 0 && (
        <span
          aria-hidden="true"
          className="tabular absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white ring-2 ring-white"
        >
          {waiting}
        </span>
      )}
    </button>
  );
}
