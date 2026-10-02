import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DtrSheet from "../../components/DtrSheet";
import Icon from "../../components/Icon";
import Pagination from "../../components/Pagination";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  FilterChips,
  FormError,
  Modal,
  ProgressBar,
  SkeletonRows,
  Stars,
  StatusBadge,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { formatFileSize } from "../../lib/files";
import {
  dueLabel,
  formatDate,
  formatDayDate,
  formatHours,
  formatTime,
} from "../../lib/format";
import { notifyDataChanged } from "../../lib/navCounts";
import { errorText, toast } from "../../lib/toast";
import { usePagination } from "../../lib/usePagination";
import { coordinatorRequest, downloadSubmittedDocument } from "./request";

/*
|--------------------------------------------------------------------------
| ONE STUDENT'S RECORD
|--------------------------------------------------------------------------
|
| Everything the programme holds about a single student, in one place:
| attendance, tasks, documents, evaluations, absences, schedule, and a
| printable time record. Reviewing stays with the supervisor; the
| coordinator can decide documents and absences here only when the student
| has no active supervisor to do it.
|
*/

type Student = {
  student_id: string;
  name: string;
  email: string;
  program: string | null;
  company: string | null;
  required_hours: number;
  is_active: boolean;
  completed_at: string | null;
  supervisor_name: string | null;
  supervisor_active: boolean;
  hours_rendered: number;
};

type Log = {
  id: number;
  date: string;
  time_in: string | null;
  break_time: string | null;
  break_end_time: string | null;
  time_out: string | null;
  hours: number | string | null;
  note: string | null;
  status: string;
  review_notes: string | null;
};

type Task = {
  id: number;
  title: string;
  priority: string | null;
  status: string;
  due_date: string | null;
  assigned_by: string | null;
  review_notes: string | null;
  review_rating: number | null;
};

type Doc = {
  id: number;
  doc_type: string;
  original_filename: string;
  size_bytes: number | string;
  status: "Pending" | "Approved" | "Rejected";
  review_notes: string | null;
  uploaded_at: string;
};

type Evaluation = {
  id: number;
  evaluator_type: "student" | "supervisor" | "teacher";
  evaluator_name: string | null;
  category: string;
  rating: number;
  comments: string | null;
  created_at: string;
};

type Absence = {
  id: number;
  date: string;
  reason: string;
  status: "Pending" | "Excused" | "Unexcused";
  review_notes: string | null;
};

type ScheduleDay = {
  id: number;
  day: string;
  start_time: string;
  end_time: string;
  focus: string | null;
  hours: number | string | null;
};

type Overview = {
  student: Student;
  attendance: Log[];
  tasks: Task[];
  documents: Doc[];
  evaluations: Evaluation[];
  absences: Absence[];
  schedule: ScheduleDay[];
};

type Tab = "overview" | "attendance" | "tasks" | "documents" | "evaluations" | "record";

/** A decision the coordinator is making in place of a missing supervisor. */
type Pending =
  | { kind: "document"; id: number; label: string }
  | { kind: "absence"; id: number; label: string };

export default function StudentRecord() {
  const { studentId = "" } = useParams();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [rejecting, setRejecting] = useState<Pending | null>(null);

  const load = useCallback(async () => {
    try {
      const overview = await coordinatorRequest<Overview>(
        `/api/coordinator/students/${encodeURIComponent(studentId)}/overview`
      );
      setData(overview);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load this student's record."));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const student = data?.student;
  // Reviewing is the supervisor's job; the coordinator steps in only when
  // there is nobody active to do it.
  const canDecide = Boolean(student && !student.supervisor_active);

  const decide = async (item: Pending, approve: boolean, note = "") => {
    await coordinatorRequest(
      item.kind === "document"
        ? `/api/documents/${item.id}/review`
        : `/api/absences/${item.id}/review`,
      {
        method: "PATCH",
        body:
          item.kind === "document"
            ? { status: approve ? "Approved" : "Rejected", review_notes: note }
            : { status: approve ? "Excused" : "Unexcused", notes: note },
      }
    );
    toast.success(
      `${item.label} ${
        item.kind === "document"
          ? approve
            ? "approved"
            : "rejected"
          : approve
            ? "excused"
            : "marked unexcused"
      }. ${student?.name || "The student"} has been notified.`
    );
    notifyDataChanged();
    await load();
  };

  const approve = (item: Pending) => {
    decide(item, true).catch((decisionError: unknown) =>
      toast.error(errorText(decisionError, "That could not be saved."))
    );
  };

  const completion =
    student && student.required_hours > 0
      ? Math.min(100, Math.round((student.hours_rendered / student.required_hours) * 100))
      : 0;

  const back = (
    <Link
      to="/coordinator/students"
      className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      <Icon name="chevron-right" size={15} className="rotate-180" />
      All students
    </Link>
  );

  return (
    <CoordinatorLayout
      title={student?.name || "Student record"}
      subtitle={
        student
          ? [student.student_id, student.program, student.company].filter(Boolean).join(" · ")
          : undefined
      }
      actions={back}
    >
      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        {loading ? (
          <Card>
            <SkeletonRows rows={6} />
          </Card>
        ) : !data || !student ? null : (
          <>
            <div className="print:hidden">
              <FilterChips
                label="Section"
                value={tab}
                onChange={setTab}
                options={[
                  { value: "overview", label: "Overview" },
                  { value: "attendance", label: "Attendance", count: data.attendance.length },
                  { value: "tasks", label: "Tasks", count: data.tasks.length },
                  { value: "documents", label: "Documents", count: data.documents.length },
                  { value: "evaluations", label: "Evaluations", count: data.evaluations.length },
                  { value: "record", label: "Time record" },
                ]}
              />
            </div>

            {canDecide && tab !== "record" && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
                <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                <span>
                  {student.supervisor_name
                    ? `${student.supervisor_name}'s account is deactivated, so nobody is reviewing this student's work.`
                    : "This student has no supervisor, so nobody is reviewing their work."}{" "}
                  You can decide their pending documents and absences here until one is assigned.
                </span>
              </p>
            )}

            {tab === "overview" && (
              <div className="grid items-start gap-5 lg:grid-cols-5">
                <Card className="p-4 sm:p-5 lg:col-span-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={student.is_active ? "Active" : "Deactivated"}
                      tone={student.is_active ? "good" : "neutral"}
                    />
                    {student.completed_at && (
                      <StatusBadge
                        status={`Hours completed ${formatDate(student.completed_at)}`}
                        tone="good"
                      />
                    )}
                  </div>
                  <div className="mt-4 flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700">Verified hours</span>
                    <span className="tabular text-slate-900">
                      {formatHours(student.hours_rendered)} of{" "}
                      {formatHours(student.required_hours)} ({completion}%)
                    </span>
                  </div>
                  <ProgressBar value={completion} className="mt-2" />
                  <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    <Fact label="Email" value={student.email} />
                    <Fact
                      label="Supervisor"
                      value={
                        student.supervisor_name
                          ? `${student.supervisor_name}${student.supervisor_active ? "" : " (deactivated)"}`
                          : "Unassigned"
                      }
                    />
                    <Fact label="Program" value={student.program || "—"} />
                    <Fact label="Company" value={student.company || "—"} />
                  </dl>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader
                    title="Weekly schedule"
                    action={
                      <Link
                        to={`/coordinator/requirements?student=${encodeURIComponent(student.student_id)}`}
                        className="text-sm font-semibold text-psu-700 hover:underline"
                      >
                        Edit
                      </Link>
                    }
                  />
                  <div className="mt-3">
                    {data.schedule.length === 0 ? (
                      <EmptyState icon="calendar" title="No schedule set" />
                    ) : (
                      <ul className="divide-y divide-slate-100 border-t border-slate-100">
                        {data.schedule.map((day) => (
                          <li
                            key={day.id}
                            className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm sm:px-5"
                          >
                            <span className="font-medium text-slate-900">{day.day}</span>
                            <span className="tabular text-slate-600">
                              {day.start_time} – {day.end_time}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Card>

                <Card className="lg:col-span-5">
                  <CardHeader
                    title="Absences"
                    description={
                      data.absences.length === 0 ? undefined : `${data.absences.length} filed`
                    }
                  />
                  <div className="mt-3">
                    {data.absences.length === 0 ? (
                      <EmptyState icon="calendar" title="No absences filed" />
                    ) : (
                      <ul className="divide-y divide-slate-100 border-t border-slate-100">
                        {data.absences.map((item) => {
                          const pending: Pending = {
                            kind: "absence",
                            id: item.id,
                            label: `Absence on ${formatDayDate(item.date)}`,
                          };
                          return (
                            <li
                              key={item.id}
                              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900">
                                  {formatDayDate(item.date)}
                                </p>
                                <p className="text-sm text-slate-600">{item.reason}</p>
                                {item.review_notes && (
                                  <p className="text-sm text-slate-500">Note: {item.review_notes}</p>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <StatusBadge
                                  status={item.status === "Pending" ? "Awaiting review" : item.status}
                                  tone={
                                    item.status === "Excused"
                                      ? "good"
                                      : item.status === "Unexcused"
                                        ? "bad"
                                        : "waiting"
                                  }
                                />
                                {canDecide && item.status === "Pending" && (
                                  <DecideButtons
                                    approveLabel="Excuse"
                                    rejectLabel="Unexcused"
                                    onApprove={() => approve(pending)}
                                    onReject={() => setRejecting(pending)}
                                  />
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {tab === "attendance" && <AttendanceTab logs={data.attendance} />}

            {tab === "tasks" && (
              <Card>
                {data.tasks.length === 0 ? (
                  <EmptyState icon="tasks" title="No tasks assigned" />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.tasks.map((task) => (
                      <li key={task.id} className="px-4 py-3.5 sm:px-5">
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                          <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                          <StatusBadge status={task.status === "Pending" ? "To do" : task.status} />
                        </div>
                        <p className="mt-0.5 text-sm text-slate-600">
                          {task.status === "Pending" || task.status === "In Progress"
                            ? dueLabel(task.due_date)
                            : `Due ${formatDate(task.due_date)}`}
                          {task.assigned_by && ` · assigned by ${task.assigned_by}`}
                          {task.priority && ` · ${task.priority} priority`}
                        </p>
                        {task.review_notes && (
                          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                            {typeof task.review_rating === "number" && task.review_rating > 0 && (
                              <Stars value={task.review_rating} />
                            )}
                            <span>
                              <span className="font-medium text-slate-700">Supervisor:</span>{" "}
                              {task.review_notes}
                            </span>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {tab === "documents" && (
              <Card>
                {data.documents.length === 0 ? (
                  <EmptyState icon="document" title="No documents submitted" />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.documents.map((item) => {
                      const pending: Pending = { kind: "document", id: item.id, label: item.doc_type };
                      return (
                        <li
                          key={item.id}
                          className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900">{item.doc_type}</p>
                            <p className="truncate text-xs text-slate-500">
                              {item.original_filename} · {formatFileSize(Number(item.size_bytes))} ·{" "}
                              {formatDate(item.uploaded_at)}
                            </p>
                            {item.review_notes && (
                              <p className="mt-1 text-sm text-slate-600">Note: {item.review_notes}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <StatusBadge
                              status={item.status === "Pending" ? "Awaiting review" : item.status}
                              tone={item.status === "Pending" ? "waiting" : undefined}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                downloadSubmittedDocument(item.id, item.original_filename).catch(
                                  (downloadError: unknown) =>
                                    toast.error(
                                      errorText(downloadError, "The document could not be downloaded.")
                                    )
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-psu-700 hover:bg-psu-50"
                            >
                              <Icon name="download" size={15} />
                              Download
                            </button>
                            {canDecide && item.status === "Pending" && (
                              <DecideButtons
                                approveLabel="Approve"
                                rejectLabel="Reject"
                                onApprove={() => approve(pending)}
                                onReject={() => setRejecting(pending)}
                              />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            )}

            {tab === "evaluations" && (
              <Card>
                {data.evaluations.length === 0 ? (
                  <EmptyState icon="star" title="No evaluations yet" />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.evaluations.map((item) => (
                      <li key={item.id} className="px-4 py-3.5 sm:px-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.category}</p>
                          <Stars value={item.rating} />
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.evaluator_type === "student"
                            ? "The student, about their company"
                            : item.evaluator_type === "teacher"
                              ? `${item.evaluator_name || "OJT coordinator"} (coordinator)`
                              : `${item.evaluator_name || "Supervisor"} (supervisor)`}{" "}
                          · {formatDate(item.created_at)}
                        </p>
                        {item.comments && (
                          <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600">
                            {item.comments}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {tab === "record" && (
              <DtrSheet
                loading={false}
                person={{
                  name: student.name,
                  studentId: student.student_id,
                  program: student.program,
                  company: student.company,
                  supervisor: student.supervisor_name,
                }}
                logs={data.attendance}
                absences={data.absences}
              />
            )}
          </>
        )}
      </div>

      {rejecting && (
        <ReasonDialog
          key={`${rejecting.kind}-${rejecting.id}`}
          item={rejecting}
          onClose={() => setRejecting(null)}
          onSubmit={async (note) => {
            await decide(rejecting, false, note);
            setRejecting(null);
          }}
        />
      )}
    </CoordinatorLayout>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="truncate text-slate-900">{value}</dd>
    </div>
  );
}

function DecideButtons({
  approveLabel,
  rejectLabel,
  onApprove,
  onReject,
}: {
  approveLabel: string;
  rejectLabel: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <>
      <Button variant="secondary" onClick={onReject} className="h-8 px-2.5 text-red-700">
        {rejectLabel}
      </Button>
      <Button onClick={onApprove} className="h-8 px-2.5">
        {approveLabel}
      </Button>
    </>
  );
}

function AttendanceTab({ logs }: { logs: Log[] }) {
  const pager = usePagination(logs, 20);
  if (logs.length === 0) {
    return (
      <Card>
        <EmptyState icon="clock" title="No attendance logged" />
      </Card>
    );
  }
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500">
              <th scope="col" className="px-5 py-3 font-medium">Date</th>
              <th scope="col" className="px-3 py-3 font-medium">Time in</th>
              <th scope="col" className="px-3 py-3 font-medium">Time out</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Hours</th>
              <th scope="col" className="px-3 py-3 font-medium">Notes</th>
              <th scope="col" className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pager.pageItems.map((log) => (
              <tr key={log.id}>
                <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-900">
                  {formatDayDate(log.date)}
                </td>
                <td className="tabular whitespace-nowrap px-3 py-3 text-slate-700">
                  {formatTime(log.time_in)}
                </td>
                <td className="tabular whitespace-nowrap px-3 py-3 text-slate-700">
                  {log.time_out ? formatTime(log.time_out) : "Not recorded"}
                </td>
                <td className="tabular whitespace-nowrap px-3 py-3 text-right text-slate-900">
                  {log.time_out ? formatHours(log.hours) : "—"}
                </td>
                <td className="min-w-48 px-3 py-3 text-slate-600">
                  {log.note || ""}
                  {log.review_notes && (
                    <span className="block text-slate-500">Reviewer: {log.review_notes}</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={log.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination state={pager} noun="log" />
    </Card>
  );
}

/** Asks for the reason the student will be shown when something is refused. */
function ReasonDialog({
  item,
  onClose,
  onSubmit,
}: {
  item: Pending;
  onClose: () => void;
  onSubmit: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!note.trim()) return setError("Write a reason. The student will see it.");
    setBusy(true);
    setError("");
    try {
      await onSubmit(note.trim());
    } catch (submitError) {
      setError(errorText(submitError, "That could not be saved."));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={item.kind === "document" ? `Reject ${item.label}` : "Mark as unexcused"}
      description={item.kind === "absence" ? item.label : undefined}
      locked={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} busy={busy}>
            {item.kind === "document" ? "Reject document" : "Mark unexcused"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label htmlFor="decision-reason" className="block text-sm font-medium text-slate-700">
          Reason
        </label>
        <textarea
          id="decision-reason"
          rows={4}
          maxLength={1000}
          autoFocus
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="field resize-none"
        />
        <FormError message={error} />
      </div>
    </Modal>
  );
}
