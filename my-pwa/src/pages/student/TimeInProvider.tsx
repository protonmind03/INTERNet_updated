import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ConfirmDialog } from "../../components/ui";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatDuration, formatTime } from "../../lib/format";
import { savedFetch } from "../../lib/offlineStore";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import { useOnline } from "../../lib/useOnline";
import { PrivacyNoticeDialog } from "./Privacy";
import TimeInDialog from "./TimeInDialog";
import { TimeInContext, useOptionalTimeIn, type TimeInStep, type TimeInValue } from "./timeInContext";
import { useAttendance, workedMinutes } from "./useAttendance";
import { usePrivacy } from "./usePrivacy";

/*
|--------------------------------------------------------------------------
| TIME-IN ACTIONS, SHARED
|--------------------------------------------------------------------------
|
| The student's attendance for the day and the four things they do with
| it: time in (privacy notice first, then the camera check), start a
| break, come back, time out. They are held here once, so the card on the
| Attendance page, the button in a page header and the floating button on
| a phone all open the same dialogs and see the same day.
|
| StudentLayout mounts this around every student page. A page that reads
| the attendance before it renders the layout (Today, Attendance, Time
| record) mounts it itself, one level higher; the layout then uses that
| one, so there is never more than one.
|
*/

/** The shortest note of the day's work the app accepts at time-out. */
const ACCOMPLISHMENT_MIN = 15;

type OpenTask = { id: number; title: string; status: string };

export default function TimeInProvider({ children }: { children: ReactNode }) {
  // Already inside one (a page mounted it above the layout): use that.
  const outer = useOptionalTimeIn();
  if (outer) return <>{children}</>;
  return <TimeInActions>{children}</TimeInActions>;
}

function TimeInActions({ children }: { children: ReactNode }) {
  const student = useAccount("student");
  const attendance = useAttendance(student?.student_id);
  const { todayLog, busy } = attendance;
  const online = useOnline();

  const [now, setNow] = useState(() => new Date());
  const [timeInOpen, setTimeInOpen] = useState(false);
  // The first time-in is the first photo, so the privacy notice comes
  // first. If the notice could not be loaded, the time-in goes ahead.
  const privacy = usePrivacy(student?.student_id);
  const [consentOpen, setConsentOpen] = useState(false);
  const mustConsent = Boolean(privacy.state && !privacy.state.current);
  const openTimeIn = useCallback(() => {
    if (mustConsent) setConsentOpen(true);
    else setTimeInOpen(true);
  }, [mustConsent]);
  const [pending, setPending] = useState<TimeInStep | null>(null);
  const openStep = useCallback((step: TimeInStep) => setPending(step), []);
  // What the student did today, asked for at time-out and kept as a draft
  // until it is sent.
  const [accomplishment, setAccomplishment] = useState("");
  const [accomplishmentError, setAccomplishmentError] = useState("");
  const discardAccomplishment = useDraft(
    "student",
    pending === "out" ? "accomplishment" : null,
    accomplishment,
    setAccomplishment
  );
  // The tasks the student may say they worked on today: the ones still
  // open. Read from the same saved copy the Tasks page keeps, so the list
  // is there with no connection too. Choosing any is optional.
  const [openTasks, setOpenTasks] = useState<OpenTask[]>([]);
  const [workedOn, setWorkedOn] = useState<Set<number>>(new Set());
  const studentId = student?.student_id;
  useEffect(() => {
    if (pending !== "out" || !studentId) return;
    let current = true;
    savedFetch(
      "student",
      "tasks",
      `${API_URL}/api/tasks/student/${encodeURIComponent(studentId)}`,
      withStudentAuth()
    )
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (!current) return;
        const list: OpenTask[] = Array.isArray(data) ? data : Array.isArray(data?.tasks) ? data.tasks : [];
        setOpenTasks(list.filter((task) => task.status === "Pending" || task.status === "In Progress"));
      })
      // Without the list the time-out goes ahead with its note alone.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [pending, studentId]);

  // The clock shows hours and minutes, so it only needs to move when the
  // minute does; a seconds counter was the one thing on this page that
  // never stopped moving.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const confirm = async () => {
    const action = pending;
    if (!action) return;
    if (action === "out" && accomplishment.trim().length < ACCOMPLISHMENT_MIN) {
      setAccomplishmentError(
        `Say what you accomplished today in at least ${ACCOMPLISHMENT_MIN} characters.`
      );
      return;
    }
    setAccomplishmentError("");
    try {
      const outcome =
        action === "break"
          ? await attendance.startBreak()
          : action === "back"
            ? await attendance.endBreak()
            : await attendance.timeOut(
                accomplishment,
                // Only tasks still on the list: one finished meanwhile is not sent.
                openTasks.filter((task) => workedOn.has(task.id)).map((task) => task.id)
              );
      if (action === "out") {
        discardAccomplishment();
        setAccomplishment("");
        setWorkedOn(new Set());
      }
      if (outcome === "queued") {
        // No connection: kept on the phone with the time it was pressed.
        toast.info("Saved on this phone. It will be sent when you're back online.");
      } else if (action === "break") {
        toast.success("Break started.");
      } else if (action === "back") {
        toast.success("Welcome back. Your break has ended.");
      } else {
        toast.celebrate("Time-out recorded. Your supervisor will verify today's log.");
      }
      setPending(null);
    } catch (error) {
      toast.error(errorText(error, "That didn't go through. Please try again."));
    }
  };

  const worked = todayLog ? workedMinutes(todayLog, now) : 0;
  const dialogOpen = timeInOpen || consentOpen || pending !== null;

  const value = useMemo<TimeInValue>(
    () => ({ attendance, now, online, openTimeIn, openStep, dialogOpen }),
    [attendance, now, online, openTimeIn, openStep, dialogOpen]
  );

  return (
    <TimeInContext.Provider value={value}>
      {children}

      <TimeInDialog
        open={timeInOpen}
        now={now}
        onClose={() => setTimeInOpen(false)}
        loadChallenge={attendance.livenessChallenge}
        onSubmit={attendance.timeIn}
      />

      {consentOpen && privacy.state && (
        <PrivacyNoticeDialog
          notice={privacy.state.notice}
          onClose={() => setConsentOpen(false)}
          onAgree={async () => {
            await privacy.agree();
            setConsentOpen(false);
            setTimeInOpen(true);
          }}
        />
      )}

      <ConfirmDialog
        open={pending === "break"}
        title="Start your break?"
        message={`Your break will start at ${formatTime(now)}. It is not counted in your rendered hours.`}
        confirmLabel="Start break"
        busy={busy}
        busyProcess="timeIn"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === "back"}
        title="Back to work?"
        message={`Your break will end at ${formatTime(now)}.`}
        confirmLabel="Back to work"
        busy={busy}
        busyProcess="timeIn"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === "out"}
        title="Time out for today?"
        message={`Your time-out will be recorded at ${formatTime(now)}${
          todayLog ? `, with ${formatDuration(worked)} worked` : ""
        }. You can't undo this.`}
        confirmLabel="Time out"
        cancelLabel="Keep working"
        tone="danger"
        busy={busy}
        busyProcess="timeIn"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      >
        <label htmlFor="accomplishment" className="block text-sm font-medium text-slate-900">
          What did you accomplish today?
        </label>
        <p id="accomplishment-hint" className="mt-0.5 text-xs text-slate-500">
          A sentence or two. Your supervisor sees it with this log, and it is printed on your
          time record.
        </p>
        <textarea
          id="accomplishment"
          rows={3}
          maxLength={1000}
          value={accomplishment}
          onChange={(event) => {
            setAccomplishment(event.target.value);
            if (accomplishmentError) setAccomplishmentError("");
          }}
          aria-describedby="accomplishment-hint"
          aria-invalid={Boolean(accomplishmentError)}
          className="field mt-2"
        />
        {accomplishmentError && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {accomplishmentError}
          </p>
        )}
        {openTasks.length > 0 && (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-slate-900">
              Which tasks did you work on today?{" "}
              <span className="font-normal text-slate-600">(optional)</span>
            </legend>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {openTasks.map((task) => (
                <li key={task.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1.5 text-sm text-slate-800 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={workedOn.has(task.id)}
                      onChange={() =>
                        setWorkedOn((chosen) => {
                          const next = new Set(chosen);
                          if (next.has(task.id)) next.delete(task.id);
                          else next.add(task.id);
                          return next;
                        })
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-400 text-psu-700"
                    />
                    <span className="min-w-0 break-words">{task.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </ConfirmDialog>
    </TimeInContext.Provider>
  );
}
