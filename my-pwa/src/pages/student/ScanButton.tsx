import { useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import QrHandOff from "../../components/QrHandOff";
import { Modal } from "../../components/ui";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { nextStep } from "./nextStep";
import { useTimeIn } from "./timeInContext";

/*
|--------------------------------------------------------------------------
| SCAN (revisions, November 2026)
|--------------------------------------------------------------------------
|
| A button left of the bell on every trainee page, in place of the round
| floating button phones had. What it does depends on the screen:
|
|   computer or tablet  "Time in from your phone": a QR code that opens
|                       INTERNet on the phone, where the camera check runs
|   phone               the day's next step at once (Time in opens the
|                       camera check; Lunch break, End break, Time out
|                       their dialogs); once the day is done, a short note
|
| On a phone the button's face says the step, so it is never a surprise.
|
*/

export default function ScanButton() {
  const phone = useMediaQuery("(max-width: 767px)");
  const timeIn = useTimeIn();
  const [open, setOpen] = useState(false);
  const { stage, loading, busy, todayLog } = timeIn.attendance;
  const step = phone && !loading ? nextStep(stage) : null;
  const waiting = todayLog?.waiting?.length ?? 0;

  // Named "Scan: …" so it is never mistaken for the time card's own step button of the same name.
  // The visible word "Scan" leads the spoken name too (WCAG 2.5.3, label in name).
  const label = step ? `Scan: ${step.name}` : phone ? "Scan: Today's attendance" : "Scan: Time in from your phone";
  const onClick = () => {
    if (step) step.run(timeIn);
    else setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-haspopup="dialog"
        aria-label={`${label}${waiting > 0 ? `. ${waiting === 1 ? "1 step is" : `${waiting} steps are`} waiting to be sent.` : ""}`}
        title={label}
        data-testid="scan-button"
        className="relative inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-white/25 px-2.5 text-sm font-bold text-white hover:bg-white/10 disabled:opacity-60 md:border-(--role-hairline) md:bg-white md:px-3 md:text-(--role-ink) md:hover:bg-slate-50"
      >
        <Icon name={step ? step.icon : "scan"} size={20} />
        <span className="hidden lg:inline">Scan</span>
        {step && <span className="max-[419px]:sr-only">{step.label}</span>}
        {waiting > 0 && (
          <span aria-hidden="true" className="tabular absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white ring-2 ring-white">
            {waiting}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={phone ? "Today's attendance" : "Time in from your phone"}
        description={phone ? undefined : "The camera check works best on your phone. Scan this code to open INTERNet there."}
        size="md"
      >
        {phone ? (
          <div className="space-y-3 text-[15px] text-slate-700">
            <p>{loading ? "Checking today's attendance…" : "You have finished today's steps. Nothing else to record until your next working day."}</p>
            <Link to="/daily-log" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center gap-1.5 font-bold text-psu-700 hover:underline">
              See your days in Attendance
              <Icon name="chevron-right" size={16} />
            </Link>
          </div>
        ) : (
          <QrHandOff variant="large" />
        )}
      </Modal>
    </>
  );
}
