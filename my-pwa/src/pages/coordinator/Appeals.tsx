import { useCallback, useEffect, useState } from "react";
import AttendancePhoto from "../../components/AttendancePhoto";
import { Button, Card, EmptyState, ErrorNotice, FormError, SkeletonRows } from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { formatDateTime, formatLongDate, formatTime } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { changedByOthers, coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| APPEALS
|--------------------------------------------------------------------------
|
| A student's appeal of a supervisor's time correction, rejected time-in
| photo or rejected day (backend routes/appeals.ts). The coordinator reads
| the decision and the student's reason side by side, and upholds or
| overturns it with a note both of them are sent. Overturning undoes the
| decision. This page moves into the Resolution Center in a later iteration.
|
*/

type Kind = "time_correction" | "time_in_rejection" | "attendance_rejection";

type Appeal = {
  id: number;
  kind: Kind;
  reason: string;
  status: "open" | "upheld" | "overturned" | "withdrawn";
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
  attendance_id: number;
  student_name: string;
  supervisor_name: string | null;
  date: string;
  log_status: string;
  time_in: string | null;
  break_time: string | null;
  break_end_time: string | null;
  time_out: string | null;
  review_notes: string | null;
  photo_rejection_reason: string | null;
  photo_redo_status: string | null;
  time_correction_reason: string | null;
  times_before_correction: Record<string, string | null> | null;
  image_url: string | null;
  rejected_photo_path: string | null;
  /** Sent back with the decision (migration 062). Missing from an older server. */
  version?: number;
};

const KIND_TITLE: Record<Kind, string> = {
  time_correction: "Time correction",
  time_in_rejection: "Rejected time-in photo",
  attendance_rejection: "Rejected attendance",
};

const STATUS_TEXT: Record<Appeal["status"], string> = {
  open: "Waiting",
  upheld: "Upheld",
  overturned: "Overturned",
  withdrawn: "Withdrawn by the student",
};

/** "8:00 AM" from "08:00". */
function clock(value: string | null | undefined): string {
  if (!value) return "none";
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

export default function CoordinatorAppeals() {
  const [show, setShow] = useState<"open" | "decided">("open");
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{ appeals: Appeal[] }>(`/api/coordinator/appeals?status=${show}`);
      setAppeals(data.appeals);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the appeals."));
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <CoordinatorLayout
      title="Appeals"
      subtitle="Students asking you to look again at a time correction or a rejection. Each decision is sent to the student and the supervisor."
    >
      <div className="mb-4 flex gap-2" role="group" aria-label="Show appeals">
        {(["open", "decided"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={show === value}
            onClick={() => {
              if (value === show) return;
              setLoading(true);
              setShow(value);
            }}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold ring-1 ring-inset ${
              show === value ? "bg-psu-700 text-white ring-psu-700" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {value === "open" ? "Waiting for you" : "Decided"}
          </button>
        ))}
      </div>
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      {loading ? (
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      ) : appeals.length === 0 ? (
        <Card>
          <EmptyState icon="flag" title={show === "open" ? "No appeals waiting" : "No decided appeals yet"} />
        </Card>
      ) : (
        <ul className="space-y-4">
          {appeals.map((appeal) => (
            <li key={appeal.id}>
              <AppealCard appeal={appeal} onDecided={() => void load()} />
            </li>
          ))}
        </ul>
      )}
    </CoordinatorLayout>
  );
}

function AppealCard({ appeal, onDecided }: { appeal: Appeal; onDecided: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"upheld" | "overturned" | null>(null);
  const [error, setError] = useState("");

  const decide = async (decision: "upheld" | "overturned") => {
    if (note.trim().length < 5) return setError("Write a note first. The student and the supervisor will see it.");
    setBusy(decision);
    setError("");
    try {
      const result = await coordinatorRequest<{ message: string }>(`/api/coordinator/appeals/${appeal.id}`, {
        method: "PUT",
        body: { decision, note: note.trim(), expected_version: appeal.version },
      });
      toast.success(result.message);
      onDecided();
    } catch (decideError) {
      // Decided by someone else first: say so and show the list as it is now.
      if (changedByOthers(decideError)) {
        toast.error(errorText(decideError, "This appeal changed while you had it open."));
        onDecided();
        return;
      }
      setError(errorText(decideError, "The decision could not be saved."));
    } finally {
      setBusy(null);
    }
  };

  const before = appeal.times_before_correction;
  const decisionText =
    appeal.kind === "time_correction"
      ? `Times corrected. Reason: ${appeal.time_correction_reason ?? "none given"}`
      : appeal.kind === "time_in_rejection"
        ? `Time-in photo rejected. Reason: ${appeal.photo_rejection_reason ?? "none given"}${
            appeal.photo_redo_status === "missed" ? " No new photo was taken in time, so the day was closed as absent." : appeal.photo_redo_status === "submitted" ? " A new photo was taken." : ""
          }`
        : `Attendance rejected. Reason: ${appeal.review_notes ?? "none given"}`;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">
          {appeal.student_name} · {KIND_TITLE[appeal.kind]}
        </h2>
        <span className="text-sm text-slate-600">{STATUS_TEXT[appeal.status]}</span>
      </div>
      <p className="mt-0.5 text-sm text-slate-600">
        Log for {formatLongDate(appeal.date)} · supervisor {appeal.supervisor_name ?? "none"} · appealed {formatDateTime(appeal.created_at)}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-slate-50 px-3.5 py-3 text-sm text-slate-800 ring-1 ring-inset ring-slate-200">
          <p className="font-semibold text-slate-900">The decision</p>
          <p className="mt-1">{decisionText}</p>
          {appeal.kind === "time_correction" && before && (
            <p className="mt-1 text-slate-600">
              Before: in {clock(before.time_in)}, lunch {before.break_time ? `${clock(before.break_time)} to ${clock(before.break_end_time)}` : "none"}, out {clock(before.time_out)}.
              {" "}Now: in {formatTime(appeal.time_in)}, out {appeal.time_out ? formatTime(appeal.time_out) : "none"}.
            </p>
          )}
        </div>
        <div className="rounded-lg bg-psu-50/60 px-3.5 py-3 text-sm text-slate-800 ring-1 ring-inset ring-psu-600/10">
          <p className="font-semibold text-slate-900">The student's reason</p>
          <p className="mt-1 whitespace-pre-line">{appeal.reason}</p>
        </div>
      </div>

      {appeal.kind === "time_in_rejection" &&
        (appeal.rejected_photo_path ? (
          // Retaken: the two side by side, each named.
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-semibold text-slate-700">Rejected</p>
              <AttendancePhoto path={appeal.rejected_photo_path} role="coordinator" />
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold text-slate-700">Retaken</p>
              <AttendancePhoto path={appeal.image_url} role="coordinator" />
            </div>
          </div>
        ) : (
          <div className="mt-3 max-w-md">
            <AttendancePhoto path={appeal.image_url} role="coordinator" />
          </div>
        ))}

      {appeal.status === "open" ? (
        <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
          <div>
            <label htmlFor={`appeal-note-${appeal.id}`} className="mb-1.5 block text-sm font-medium text-slate-700">
              Your note to the student and the supervisor
            </label>
            <textarea
              id={`appeal-note-${appeal.id}`}
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="field resize-none"
            />
          </div>
          <FormError message={error} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => void decide("upheld")} busy={busy === "upheld"} disabled={busy !== null}>
              Uphold the decision
            </Button>
            <Button icon="check" onClick={() => void decide("overturned")} busy={busy === "overturned"} disabled={busy !== null}>
              Overturn it
            </Button>
          </div>
        </div>
      ) : (
        appeal.decision_note && (
          <p className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-700">
            <span className="font-semibold">Your note:</span> {appeal.decision_note}
          </p>
        )
      )}
    </Card>
  );
}
