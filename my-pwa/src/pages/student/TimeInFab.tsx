import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../../components/Icon";
import { useReportedHeight } from "../../lib/layers";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { nextStep } from "./nextStep";
import { useTimeIn } from "./timeInContext";

/*
|--------------------------------------------------------------------------
| THE FLOATING NEXT-STEP BUTTON (phones)
|--------------------------------------------------------------------------
|
| Iteration 21. A 56 px circle with the next step's icon, above the dock.
| A first tap opens it into a pill, "Time out · Tap again", so a stray tap
| on a phone in a pocket records nothing; it closes again after 4 s or a tap
| elsewhere. The second tap opens that step's dialog at once, in the same
| tap, so the camera may start; once the dialog closes the trainee is taken
| to Attendance, where the day is. A keyboard or a screen reader acts in one
| go ("Time out, opens the time-out dialog").
|
| It is not shown on Attendance (the full card is there) or Profile, while
| a dialog, a sheet or the on-screen keyboard is open, or once the day is
| done. It publishes its height as --inb-fab (lib/layers.ts).
|
*/

/** Pages where the button is not shown. */
const HIDDEN_ON = ["/daily-log", "/profile"];
const COLLAPSE_MS = 4000;

/** True while a dialog, sheet or menu sheet is on screen, whoever opened it. */
function useDialogOnScreen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => setOpen(document.querySelector('[role="dialog"]') !== null);
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return open;
}

/** True while a text field has focus (the on-screen keyboard is up on a phone). */
function useTyping(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const check = () => {
      const active = document.activeElement as HTMLElement | null;
      setTyping(Boolean(active?.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, [contenteditable=true]")));
    };
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", () => window.setTimeout(check, 50));
    return () => document.removeEventListener("focusin", check);
  }, []);
  return typing;
}

export default function TimeInFab() {
  const timeIn = useTimeIn();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dialogOnScreen = useDialogOnScreen();
  const typing = useTyping();
  const phone = useMediaQuery("(max-width: 767px)");
  const report = useReportedHeight<HTMLButtonElement>("--inb-fab", 12);
  const [expanded, setExpanded] = useState(false);
  const pointer = useRef<string | null>(null);
  const goAfterDialog = useRef(false);
  const button = useRef<HTMLButtonElement | null>(null);

  const { stage, loading, busy, todayLog } = timeIn.attendance;
  const step = loading ? null : nextStep(stage);

  // Open: closes after 4 s, or on a tap anywhere else.
  useEffect(() => {
    if (!expanded) return;
    const timer = window.setTimeout(() => setExpanded(false), COLLAPSE_MS);
    const elsewhere = (event: PointerEvent) => {
      if (!button.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener("pointerdown", elsewhere, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", elsewhere, true);
    };
  }, [expanded]);

  // The step's dialog was opened from here: once it closes, Attendance.
  useEffect(() => {
    if (!timeIn.dialogOpen && goAfterDialog.current) {
      goAfterDialog.current = false;
      navigate("/daily-log");
    }
  }, [timeIn.dialogOpen, navigate]);

  if (!phone || !step || HIDDEN_ON.includes(pathname) || dialogOnScreen || timeIn.dialogOpen || typing) return null;

  const waiting = todayLog?.waiting?.length ?? 0;
  const act = () => {
    setExpanded(false);
    goAfterDialog.current = true;
    step.run(timeIn);
  };
  const dialogName = step.name === "Time in" ? "the camera check" : `the ${step.name.toLowerCase()} dialog`;

  return (
    <button
      ref={(element) => {
        button.current = element;
        report(element);
      }}
      type="button"
      disabled={busy}
      aria-expanded={expanded}
      aria-label={`${step.name}, opens ${dialogName}${waiting > 0 ? `. ${waiting === 1 ? "1 step is" : `${waiting} steps are`} waiting to be sent.` : ""}`}
      onPointerDown={(event) => {
        pointer.current = event.pointerType;
      }}
      onClick={() => {
        const byPointer = pointer.current !== null;
        pointer.current = null;
        // A keyboard or a screen reader: one activation acts. A tap: the first opens, the second acts.
        if (!byPointer || expanded) act();
        else setExpanded(true);
      }}
      className={`float-fab inb-press fixed right-4 z-(--z-fab) flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-gold-400 text-sm font-bold text-psu-950 shadow-lg shadow-psu-950/25 ring-1 ring-inset ring-black/5 md:hidden print:hidden ${
        expanded ? "px-4" : "w-14"
      }`}
    >
      <Icon name={step.icon} size={22} />
      {expanded && <span aria-hidden="true">{step.label} · Tap again</span>}
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
