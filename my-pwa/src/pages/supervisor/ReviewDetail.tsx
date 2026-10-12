import { useEffect, useState, type ReactNode } from "react";
import AttendancePhoto from "../../components/AttendancePhoto";
import Icon from "../../components/Icon";
import { DailyAccomplishments, ReportParts } from "../../components/WeeklyReport";
import { Button, FormError, FormField, Modal, StarInput, StatusBadge } from "../../components/ui";
import { downloadProtectedUpload } from "../../lib/api";
import { formatFileSize } from "../../lib/files";
import {
  dueLabel,
  formatDate,
  formatDateTime,
  formatHours,
  formatLongDate,
  formatTime,
} from "../../lib/format";
import { errorText, toast, withWorkingToast } from "../../lib/toast";
import {
  downloadDocument,
  type AbsenceEntry,
  type AttendanceEntry,
  type DocumentEntry,
  type JournalEntry,
  type QueueItem,
  type SupervisorWork,
  type TaskEntry,
} from "./useSupervisorWork";

/*
|--------------------------------------------------------------------------
| REVIEW DETAIL
|--------------------------------------------------------------------------
|
| The full view of one item waiting for a decision, with the decision
| itself at the bottom. Used in the Review queue's right-hand pane and,
| on phones, inside a sheet.
|
*/

export default function ReviewDetail({
  item,
  work,
  onDecided,
  shortcuts = false,
}: {
  item: QueueItem;
  work: SupervisorWork;
  /** Called after a decision is saved, so the caller can move on. */
  onDecided: () => void;
  /** Lets the A key approve. Only for the Review queue's side-by-side view. */
  shortcuts?: boolean;
}) {
  const shared = { work, onDecided, shortcuts };
  // Keyed so notes and ratings never carry over from one item to the next.
  if (item.kind === "attendance") {
    return <AttendanceDetail key={item.key} entry={item.entry} {...shared} />;
  }
  if (item.kind === "task") {
    return <TaskDetail key={item.key} entry={item.entry} {...shared} />;
  }
  if (item.kind === "absence") {
    return <AbsenceDetail key={item.key} entry={item.entry} {...shared} />;
  }
  if (item.kind === "journal") {
    return <JournalDetail key={item.key} entry={item.entry} {...shared} />;
  }
  return <DocumentDetail key={item.key} entry={item.entry} {...shared} />;
}

type DetailProps<T> = {
  entry: T;
  work: SupervisorWork;
  onDecided: () => void;
  shortcuts?: boolean;
};

/** A toast action that takes back the decision just made. */
function undoAction(undo: () => Promise<void>, done: string) {
  return {
    label: "Undo",
    onClick: () => {
      withWorkingToast("Withdrawing the decision…", undo)
        .then(() => toast.info(done))
        .catch((error: unknown) =>
          toast.error(errorText(error, "The decision could not be undone."))
        );
    },
  };
}

/*
|--------------------------------------------------------------------------
| ATTENDANCE
|--------------------------------------------------------------------------
*/

function AttendanceDetail({ entry, work, onDecided, shortcuts }: DetailProps<AttendanceEntry>) {
  const open = !entry.time_out;
  const [correcting, setCorrecting] = useState(false);
  const decided = entry.status !== "Pending";
  const rejected = entry.status === "Rejected" || entry.status === "Flagged";

  /** Lets a decision made by mistake be taken back straight from the toast. */
  const undoFrom = (decided: "Verified" | "Rejected") =>
    undoAction(
      () => work.decideAttendance(entry.id, "Pending", undefined, decided),
      "Decision withdrawn. The log is back in your queue."
    );

  return (
    <DetailShell
      eyebrow="Attendance log"
      title={entry.student_name}
      meta={formatLongDate(entry.date)}
      status={decided ? entry.status : undefined}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Fact label="Time in" value={formatTime(entry.time_in)} />
        <Fact
          label="Lunch"
          value={
            entry.break_time
              ? `${formatTime(entry.break_time)} – ${
                  entry.break_end_time ? formatTime(entry.break_end_time) : "…"
                }`
              : "None"
          }
        />
        <Fact label="Time out" value={open ? "Not yet" : formatTime(entry.time_out)} />
        <Fact label="Hours" value={open ? "—" : formatHours(entry.hours)} strong />
      </dl>

      <div>
        <button
          type="button"
          onClick={() => setCorrecting(true)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-psu-700 hover:underline"
        >
          <Icon name="edit" size={15} />
          Correct the times
        </button>
        {entry.time_correction_reason && (
          <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2.5 text-sm text-slate-700">
            <span className="font-semibold">
              Times corrected
              {entry.time_corrected_at ? ` ${formatDateTime(entry.time_corrected_at)}` : ""}:
            </span>{" "}
            {entry.time_correction_reason}
          </p>
        )}
      </div>
      {correcting && (
        <CorrectTimesDialog entry={entry} work={work} onClose={() => setCorrecting(false)} />
      )}

      {entry.accomplishments && (
        <Quote label="What the intern accomplished">{entry.accomplishments}</Quote>
      )}
      {entry.tasks && entry.tasks.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-600">Tasks they said they worked on</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-800">
            {entry.tasks.map((task) => (
              <li key={task.id} className="break-words">
                {task.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      {entry.note && <Quote label="Intern's note">{entry.note}</Quote>}

      {entry.correction_note && (
        <div className="rounded-xl border border-psu-200 bg-psu-50 px-4 py-3">
          <p className="text-xs font-medium text-psu-800">
            Intern's correction
            {entry.corrected_at && ` · ${formatDateTime(entry.corrected_at)}`}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-psu-950">
            {entry.correction_note}
          </p>
        </div>
      )}

      {entry.review_notes && (
        <Quote label={rejected ? "Your reason for rejecting" : "Your earlier note"}>
          {entry.review_notes}
        </Quote>
      )}

      <CaptureNote entry={entry} />
      {entry.recorded_offline && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-inset ring-amber-600/20">
          <Icon name="clock" size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <span>
            Recorded while offline. The intern's phone had no connection for lunch or the
            time-out on this log, so that time comes from the phone's clock, not the server's.
          </span>
        </p>
      )}

      <AttendancePhoto path={entry.image_url} role="supervisor" />

      <Decision
        key={`${entry.id}-${entry.status}`}
        approveLabel={rejected ? "Verify instead" : "Verify"}
        rejectLabel={entry.status === "Verified" ? "Reject instead" : "Reject"}
        approveHidden={entry.status === "Verified"}
        rejectHidden={rejected}
        noteLabel="Reason for rejecting"
        notePlaceholder="Tell the intern what is wrong with this log."
        approveBlocked={
          open
            ? entry.capture_method === "supervisor"
              ? "You recorded this time-in yourself, so it is verified automatically when the intern times out."
              : "This intern has not timed out yet. You can verify the log once they do."
            : undefined
        }
        shortcut={shortcuts}
        onApprove={async () => {
          await work.decideAttendance(entry.id, "Verified", undefined, entry.status);
          toast.success(
            `${entry.student_name}'s log for ${formatDate(entry.date)} verified.`,
            undoFrom("Verified")
          );
          onDecided();
        }}
        onReject={async (note) => {
          await work.decideAttendance(entry.id, "Rejected", note, entry.status);
          toast.success(
            `Log rejected. ${entry.student_name} has been notified.`,
            undoFrom("Rejected")
          );
          onDecided();
        }}
      />
    </DetailShell>
  );
}

/** "08:05" in Philippine time, the zone every log is kept in. */
function clockValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Sets the times on a log, with the reason the intern will be shown. */
export function CorrectTimesDialog({
  entry,
  work,
  onClose,
}: {
  entry: AttendanceEntry;
  work: SupervisorWork;
  onClose: () => void;
}) {
  const [timeIn, setTimeIn] = useState(clockValue(entry.time_in));
  const [breakStart, setBreakStart] = useState(clockValue(entry.break_time));
  const [breakEnd, setBreakEnd] = useState(clockValue(entry.break_end_time));
  const [timeOut, setTimeOut] = useState(clockValue(entry.time_out));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!timeIn) return setError("A log needs a time-in.");
    if (reason.trim().length < 5) {
      return setError("Say why the times are being corrected. The intern will see it.");
    }
    setSaving(true);
    setError("");
    try {
      await work.correctTimes(
        entry.id,
        {
          time_in: timeIn,
          break_time: breakStart || null,
          break_end_time: breakEnd || null,
          time_out: timeOut || null,
        },
        reason
      );
      toast.success(`Times corrected. ${entry.student_name} has been told.`);
      onClose();
    } catch (saveError) {
      setError(errorText(saveError, "The times could not be corrected."));
      setSaving(false);
    }
  };

  const time = (id: string, label: string, value: string, onChange: (next: string) => void, optional = false) => (
    <FormField label={label} htmlFor={id} optional={optional}>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field"
      />
    </FormField>
  );

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title="Correct the times"
      description={`${entry.student_name} · ${formatLongDate(entry.date)}`}
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="correct-times-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : "Save times"}
          </Button>
        </>
      }
    >
      <form id="correct-times-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {time("correct-time-in", "Time in", timeIn, setTimeIn)}
          {time("correct-time-out", "Time out", timeOut, setTimeOut, true)}
          {time("correct-break-start", "Out for lunch", breakStart, setBreakStart, true)}
          {time("correct-break-end", "Back from lunch", breakEnd, setBreakEnd, true)}
        </div>
        <FormField
          label="Reason"
          htmlFor="correct-reason"
          hint="The intern sees this. The hours are worked out again from the new times."
        >
          <textarea
            id="correct-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="field resize-none"
          />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}

/** How the photo below was taken, so the reviewer knows how far to trust it. */
function CaptureNote({ entry }: { entry: AttendanceEntry }) {
  if (!entry.image_url) return null;

  if (entry.capture_method === "supervisor") {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-psu-50 px-3 py-2.5 text-sm text-psu-950 ring-1 ring-inset ring-psu-600/10">
        <Icon name="camera" size={16} className="mt-0.5 shrink-0 text-psu-600" />
        <span>
          You took this photo in person
          {entry.capture_reason ? ` (${entry.capture_reason.replace(/\.$/, "")})` : ""}.
        </span>
      </p>
    );
  }

  if (entry.capture_method === "liveness") {
    const lightUnclear = entry.liveness_checks?.flash !== "passed";
    return (
      <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950 ring-1 ring-inset ring-emerald-600/15">
        <Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-emerald-600" />
        <span>
          Taken by the camera check: a live face followed the prompts before this photo was
          taken.
          {lightUnclear && " The light check was not conclusive, so an extra prompt was asked."}
        </span>
      </p>
    );
  }

  return (
    <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-inset ring-amber-600/20">
      <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-amber-600" />
      <span>
        This photo was not taken by the camera check
        {entry.corrected_at ? "; the intern replaced it when asking for another review" : ""}.
        Look at it closely before deciding.
      </span>
    </p>
  );
}

/*
|--------------------------------------------------------------------------
| TASK
|--------------------------------------------------------------------------
*/

function TaskDetail({ entry, work, onDecided, shortcuts }: DetailProps<TaskEntry>) {
  const [rating, setRating] = useState(0);
  const undo = undoAction(
    () => work.undoTask(entry.id),
    "Review withdrawn. The task is back in your queue."
  );

  const download = async () => {
    if (!entry.submission_file) return;
    try {
      await downloadProtectedUpload(entry.submission_file, "supervisor");
    } catch (error) {
      toast.error(errorText(error, "The attachment could not be downloaded."));
    }
  };

  return (
    <DetailShell
      eyebrow="Task submission"
      title={entry.title}
      meta={`${entry.student_name} · submitted ${formatDateTime(entry.submitted_at)}`}
    >
      {entry.description && <Quote label="What you asked for">{entry.description}</Quote>}
      {entry.attachment_name && (
        <p className="flex items-center gap-1.5 text-sm text-slate-600">
          <Icon name="document" size={15} className="shrink-0 text-slate-400" />
          You attached {entry.attachment_name}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact
          label="Due"
          value={entry.due_date ? `${formatDate(entry.due_date)} (${dueLabel(entry.due_date).toLowerCase()})` : "No due date"}
        />
        <Fact label="Priority" value={entry.priority || "—"} />
      </dl>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-medium text-slate-500">Intern's submission</p>
        <p className="mt-1 whitespace-pre-line text-sm text-slate-800">
          {entry.submission_notes || "No written notes were included."}
        </p>
        {entry.submission_file && (
          <button
            type="button"
            onClick={() => void download()}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-psu-700 hover:underline"
          >
            <Icon name="download" size={15} />
            Download attachment
          </button>
        )}
      </div>

      <Decision
        key={entry.id}
        approveLabel="Approve"
        rejectLabel="Send back"
        noteLabel="Feedback for the intern"
        notePlaceholder="What was done well, or what needs to change?"
        noteAlwaysVisible
        rejectNoteHint="Say what needs to change before sending the task back."
        extra={
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">
              Rating <span className="font-normal text-slate-500">(optional)</span>
            </p>
            <StarInput value={rating} onChange={setRating} label="Rating for this task" clearable />
          </div>
        }
        shortcut={shortcuts}
        onApprove={async (note) => {
          await work.decideTask(entry.id, "Reviewed", note, rating || null);
          toast.success(`"${entry.title}" approved.`, undo);
          onDecided();
        }}
        onReject={async (note) => {
          await work.decideTask(entry.id, "In Progress", note, null);
          toast.success(`Task sent back to ${entry.student_name} for revision.`, undo);
          onDecided();
        }}
      />
    </DetailShell>
  );
}

/*
|--------------------------------------------------------------------------
| DOCUMENT
|--------------------------------------------------------------------------
*/

function DocumentDetail({ entry, work, onDecided, shortcuts }: DetailProps<DocumentEntry>) {
  const undo = undoAction(
    () => work.undoDocument(entry.id),
    "Review withdrawn. The document is back in your queue."
  );
  const download = async () => {
    try {
      await downloadDocument(entry);
    } catch (error) {
      toast.error(errorText(error, "The document could not be downloaded."));
    }
  };

  return (
    <DetailShell
      eyebrow="Document"
      title={entry.doc_type}
      meta={`${entry.student_name} · uploaded ${formatDateTime(entry.uploaded_at)}`}
    >
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-psu-50 text-psu-700">
          <Icon name="document" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {entry.original_filename}
          </p>
          <p className="text-xs text-slate-500">{formatFileSize(Number(entry.size_bytes))}</p>
        </div>
        <Button variant="secondary" icon="download" onClick={() => void download()}>
          Download
        </Button>
      </div>
      <p className="text-sm text-slate-600">
        Open the file to check it before you decide.
      </p>

      <Decision
        key={entry.id}
        approveLabel="Approve"
        rejectLabel="Reject"
        noteLabel="Reason for rejecting"
        notePlaceholder="Tell the intern what to fix before uploading again."
        shortcut={shortcuts}
        onApprove={async () => {
          await work.decideDocument(entry.id, "Approved", "");
          toast.success(`${entry.doc_type} approved for ${entry.student_name}.`, undo);
          onDecided();
        }}
        onReject={async (note) => {
          await work.decideDocument(entry.id, "Rejected", note);
          toast.success(
            `${entry.doc_type} rejected. ${entry.student_name} has been notified.`,
            undo
          );
          onDecided();
        }}
      />
    </DetailShell>
  );
}

/*
|--------------------------------------------------------------------------
| ABSENCE
|--------------------------------------------------------------------------
*/

function AbsenceDetail({ entry, work, onDecided, shortcuts }: DetailProps<AbsenceEntry>) {
  const undo = undoAction(
    () => work.decideAbsence(entry.id, "Pending", ""),
    "Decision withdrawn. The absence is back in your queue."
  );
  return (
    <DetailShell
      eyebrow="Absence"
      title={entry.student_name}
      meta={`${formatLongDate(entry.date)} · filed ${formatDateTime(entry.created_at)}`}
    >
      <Quote label="Intern's reason">{entry.reason}</Quote>
      <p className="text-sm text-slate-600">
        An excused absence is recorded as approved time off. Either way, no hours are counted
        for the day.
      </p>

      <Decision
        key={entry.id}
        approveLabel="Excuse"
        rejectLabel="Mark unexcused"
        noteLabel="Reason it is not excused"
        notePlaceholder="Tell the intern why this absence is not excused."
        shortcut={shortcuts}
        onApprove={async () => {
          await work.decideAbsence(entry.id, "Excused", "");
          toast.success(`Absence excused for ${entry.student_name}.`, undo);
          onDecided();
        }}
        onReject={async (note) => {
          await work.decideAbsence(entry.id, "Unexcused", note);
          toast.success(
            `Absence marked unexcused. ${entry.student_name} has been notified.`,
            undo
          );
          onDecided();
        }}
      />
    </DetailShell>
  );
}

/*
|--------------------------------------------------------------------------
| WEEKLY JOURNAL
|--------------------------------------------------------------------------
*/

function JournalDetail({ entry, work, onDecided, shortcuts }: DetailProps<JournalEntry>) {
  const undo = undoAction(
    () => work.decideJournal(entry.id, "Submitted", ""),
    "Decision withdrawn. The weekly report is back in your queue."
  );
  const weekEnd = new Date(`${entry.week_start}T00:00:00`);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <DetailShell
      eyebrow="Weekly report"
      title={entry.student_name}
      meta={`Week of ${formatDate(entry.week_start)} to ${formatDate(weekEnd)} · sent ${formatDateTime(entry.submitted_at)}`}
    >
      {entry.review_notes && (
        <Quote label="What you asked for when you returned it">{entry.review_notes}</Quote>
      )}
      <div className="space-y-3">
        <ReportParts report={entry} />
      </div>
      <DailyAccomplishments
        weekStart={entry.week_start}
        logs={work.attendance.filter((log) => log.student_id === entry.student_id)}
      />

      <Decision
        key={entry.id}
        approveLabel="Mark reviewed"
        rejectLabel="Return"
        noteLabel="Comment for the intern"
        notePlaceholder="A word on the week, or what to add before you can accept it."
        noteAlwaysVisible
        rejectNoteHint="Say what to add or change before returning the report."
        shortcut={shortcuts}
        onApprove={async (note) => {
          await work.decideJournal(entry.id, "Reviewed", note);
          toast.success(`${entry.student_name}'s weekly report marked reviewed.`, undo);
          onDecided();
        }}
        onReject={async (note) => {
          await work.decideJournal(entry.id, "Returned", note);
          toast.success(`Weekly report returned to ${entry.student_name}.`, undo);
          onDecided();
        }}
      />
    </DetailShell>
  );
}

/*
|--------------------------------------------------------------------------
| SHARED PIECES
|--------------------------------------------------------------------------
*/

function DetailShell({
  eyebrow,
  title,
  meta,
  status,
  children,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  /** Set when the item has already been decided; otherwise it is awaiting review. */
  status?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-psu-700">
            {eyebrow}
          </p>
          {status ? (
            <StatusBadge status={status} />
          ) : (
            <StatusBadge status="Awaiting review" tone="waiting" />
          )}
        </div>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-600">{meta}</p>
      </div>
      {children}
    </div>
  );
}

function Fact({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd
        className={`tabular mt-0.5 text-sm ${
          strong ? "font-semibold text-slate-900" : "text-slate-800"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function Quote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>
      <p className="whitespace-pre-line border-l-2 border-slate-200 pl-3 text-sm text-slate-700">
        {children}
      </p>
    </div>
  );
}

/**
 * The two-way decision at the bottom of every review. Rejecting always
 * needs a written reason, because the intern is the one who has to act on
 * it; the note field appears when "Reject" is first pressed.
 */
function Decision({
  approveLabel,
  rejectLabel,
  noteLabel,
  notePlaceholder,
  noteAlwaysVisible = false,
  rejectNoteHint,
  approveBlocked,
  approveHidden = false,
  rejectHidden = false,
  shortcut = false,
  extra,
  onApprove,
  onReject,
}: {
  /** When true, pressing A approves. */
  shortcut?: boolean;
  approveLabel: string;
  rejectLabel: string;
  /** Hide a choice that is already the current decision. */
  approveHidden?: boolean;
  rejectHidden?: boolean;
  noteLabel: string;
  notePlaceholder: string;
  noteAlwaysVisible?: boolean;
  rejectNoteHint?: string;
  /** When set, approving is not possible yet and this explains why. */
  approveBlocked?: string;
  extra?: ReactNode;
  onApprove: (note: string) => Promise<void>;
  onReject: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(noteAlwaysVisible);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const run = async (action: "approve" | "reject") => {
    if (action === "reject" && !note.trim()) {
      setNoteOpen(true);
      setError(rejectNoteHint || "Write a reason first. The intern will see it.");
      return;
    }
    setBusy(action);
    setError("");
    try {
      await (action === "approve" ? onApprove(note) : onReject(note));
    } catch (decisionError) {
      setError(errorText(decisionError, "That could not be saved. Please try again."));
      setBusy(null);
    }
  };

  // Re-attached on every render so the handler always sees the current note
  // and busy state.
  useEffect(() => {
    if (!shortcut || approveHidden) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key.toLowerCase() !== "a" ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) ||
        document.querySelector('[role="dialog"]') ||
        busy !== null ||
        approveBlocked
      ) {
        return;
      }
      event.preventDefault();
      void run("approve");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-4 border-t border-slate-200 pt-5">
      {extra}

      {noteOpen && (
        <div>
          <label
            htmlFor="decision-note"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            {noteLabel}
            {noteAlwaysVisible && (
              <span className="font-normal text-slate-500"> (optional when approving)</span>
            )}
          </label>
          <textarea
            id="decision-note"
            rows={3}
            maxLength={1000}
            value={note}
            autoFocus={!noteAlwaysVisible}
            onChange={(event) => {
              setNote(event.target.value);
              if (event.target.value.trim()) setError("");
            }}
            placeholder={notePlaceholder}
            className="field resize-none"
          />
          <p className="mt-1 text-right text-xs text-slate-500">{note.length} / 1000</p>
        </div>
      )}

      {approveBlocked && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <Icon name="clock" size={16} className="mt-0.5 shrink-0" />
          {approveBlocked}
        </p>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-red-700">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {!rejectHidden && (
          <Button
            variant="secondary"
            onClick={() => void run("reject")}
            busy={busy === "reject"}
            busyLabel="Saving"
            failed={Boolean(error)}
            busyProcess="verify"
            disabled={busy !== null}
            className="text-red-700"
          >
            {rejectLabel}
          </Button>
        )}
        {!approveHidden && (
          <Button
            icon="check"
            onClick={() => void run("approve")}
            busy={busy === "approve"}
            busyLabel="Saving"
            failed={Boolean(error)}
            busyProcess="verify"
            disabled={busy !== null || Boolean(approveBlocked)}
          >
            {approveLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
