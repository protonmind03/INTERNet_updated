import { useCallback, useEffect, useState } from "react";
import AttendancePhoto from "../../components/AttendancePhoto";
import { Button, Card, EmptyState, ErrorNotice, FilterChips, FormError, SkeletonRows, StatusBadge } from "../../components/ui";
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
| photo or rejected day (backend routes/appeals.ts). PSU redesign C2: the
| day as a timeline (in, lunch, out, the supervisor's decision, the
| appeal), then two choices, Uphold or Overturn, a note, and one button
| that sends the decision to the trainee and their supervisor.
| Overturning undoes the decision.
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

const DECISION_TITLE: Record<Kind, string> = {
  time_correction: "Times corrected",
  time_in_rejection: "Time-in photo rejected",
  attendance_rejection: "Day rejected",
};

const CHOICES = [
  { value: "upheld", title: "Uphold", line: "keep the decision" },
  { value: "overturned", title: "Overturn", line: "undo it" },
] as const;

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
      subtitle="Trainees asking you to look again at a decision"
    >
      <div className="mb-4">
        {/* A filter, so chips: underlined tabs are for the page's sections. */}
        <FilterChips
          label="Show appeals"
          options={[
            { value: "open", label: "Waiting for you" },
            { value: "decided", label: "Decided" },
          ]}
          value={show}
          onChange={(value) => {
            if (value === show) return;
            setLoading(true);
            setShow(value);
          }}
        />
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
  const [choice, setChoice] = useState<"upheld" | "overturned" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstName = appeal.student_name.split(/\s+/)[0] || appeal.student_name;

  const send = async () => {
    if (!choice) return setError("Choose Uphold or Overturn first.");
    if (note.trim().length < 5) return setError("Write a note first. The trainee and the supervisor will see it.");
    setBusy(true);
    setError("");
    try {
      const result = await coordinatorRequest<{ message: string }>(`/api/coordinator/appeals/${appeal.id}`, {
        method: "PUT",
        body: { decision: choice, note: note.trim(), expected_version: appeal.version },
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
      setError(errorText(decideError, "The decision could not be sent."));
    } finally {
      setBusy(false);
    }
  };

  const before = appeal.times_before_correction;
  const reason = appeal.kind === "time_correction" ? appeal.time_correction_reason : appeal.kind === "time_in_rejection" ? appeal.photo_rejection_reason : appeal.review_notes;
  const redo =
    appeal.kind !== "time_in_rejection"
      ? ""
      : appeal.photo_redo_status === "missed"
        ? " No new photo was taken in time, so the day was closed as absent."
        : appeal.photo_redo_status === "submitted"
          ? " A new photo was taken."
          : "";
  const beforeText =
    appeal.kind === "time_correction" && before
      ? ` Before: in ${clock(before.time_in)}, lunch ${before.break_time ? `${clock(before.break_time)} to ${clock(before.break_end_time)}` : "none"}, out ${clock(before.time_out)}.`
      : "";

  // The day as it happened, then the decision and the appeal.
  const steps: { key: string; time: string; title: string; detail?: string; decision?: boolean }[] = [
    { key: "in", time: formatTime(appeal.time_in), title: "Timed in", detail: appeal.kind === "time_in_rejection" ? "Photo below" : undefined },
    ...(appeal.break_time ? [{ key: "lunch", time: formatTime(appeal.break_time), title: "Lunch", detail: appeal.break_end_time ? `Until ${formatTime(appeal.break_end_time)}` : "No end recorded" }] : []),
    { key: "out", time: appeal.time_out ? formatTime(appeal.time_out) : "", title: appeal.time_out ? "Timed out" : "No time-out" },
    {
      key: "decision",
      time: "",
      title: `${DECISION_TITLE[appeal.kind]}${appeal.supervisor_name ? ` by ${appeal.supervisor_name}` : ""}`,
      detail: `Reason: ${reason ?? "none given"}.${redo}${beforeText}`,
      decision: true,
    },
    { key: "appeal", time: formatDateTime(appeal.created_at), title: `${firstName} appealed`, detail: appeal.reason },
  ];

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow text-psu-700">{KIND_TITLE[appeal.kind]}</p>
          <h2 className="font-display text-[20px] font-extrabold text-slate-900">{appeal.student_name}</h2>
          <p className="text-sm text-slate-600">{formatLongDate(appeal.date)}</p>
        </div>
        <StatusBadge status={STATUS_TEXT[appeal.status]} tone={appeal.status === "open" ? "waiting" : appeal.status === "overturned" ? "good" : "neutral"} />
      </div>

      <ol className="mt-4 ml-1 border-l-2 border-(--role-hairline) pl-4" aria-label="The day">
        {steps.map((step) => (
          <li key={step.key} className="relative pb-3 last:pb-0">
            <span aria-hidden="true" className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ${step.decision ? "bg-(--status-late-ink)" : "bg-psu-600"}`} />
            <p className="text-sm">
              {step.time && <span className="tabular mr-2 font-semibold text-slate-600">{step.time}</span>}
              <span className={`font-bold ${step.decision ? "text-(--status-late-ink)" : "text-slate-900"}`}>{step.title}</span>
            </p>
            {step.detail && <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{step.detail}</p>}
          </li>
        ))}
      </ol>

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
        <div className="mt-4 space-y-3 border-t border-(--role-hairline) pt-4">
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-slate-900">Your decision</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CHOICES.map((option) => (
                <label
                  key={option.value}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-2.5 ${
                    choice === option.value ? "border-psu-600 bg-psu-50" : "border-(--role-hairline) bg-white hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name={`appeal-choice-${appeal.id}`}
                    value={option.value}
                    checked={choice === option.value}
                    onChange={() => setChoice(option.value)}
                    className="h-5 w-5 shrink-0 accent-(--role-primary)"
                  />
                  <span className="text-sm">
                    <span className="font-bold text-slate-900">{option.title}</span>, {option.line}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor={`appeal-note-${appeal.id}`} className="mb-1.5 block text-sm font-bold text-slate-900">
              Note
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
          <div className="flex sm:justify-end">
            <Button icon="mail" className="w-full sm:w-auto" onClick={() => void send()} busy={busy}>
              Send decision to {firstName} and their supervisor
            </Button>
          </div>
        </div>
      ) : (
        appeal.decision_note && (
          <p className="mt-4 border-t border-(--role-hairline) pt-4 text-sm text-slate-700">
            <span className="font-semibold">Your note:</span> {appeal.decision_note}
          </p>
        )
      )}
    </Card>
  );
}
