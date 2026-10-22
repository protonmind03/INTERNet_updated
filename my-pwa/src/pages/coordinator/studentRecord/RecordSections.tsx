import type { ReactNode } from "react";
import DtrSheet from "../../../components/DtrSheet";
import FinalEvaluationView from "../../../components/FinalEvaluationView";
import Icon from "../../../components/Icon";
import Pagination from "../../../components/Pagination";
import StudentNotes from "../../../components/StudentNotes";
import EntryPictures from "../../../components/EntryPictures";
import { DailyAccomplishments, ReportParts } from "../../../components/WeeklyReport";
import { Card, EmptyState, Stars, StatusBadge } from "../../../components/ui";
import { formatFileSize } from "../../../lib/files";
import { dueLabel, formatDate, formatDayDate, formatHours, formatTime } from "../../../lib/format";
import { errorText, toast } from "../../../lib/toast";
import type { DtrCertification } from "../../../lib/useDtrCertifications";
import type { FinalEvaluation } from "../../../lib/useFinalEvaluation";
import type { Holiday } from "../../../lib/useHolidays";
import { usePagination } from "../../../lib/usePagination";
import type { PerformanceStudent } from "../performance";
import { downloadSubmittedDocument } from "../request";
import ScheduleEditor from "../ScheduleEditor";
import {
  dateKey,
  isOpenLog,
  isOpenTask,
  isOverdueTask,
  lateMinutesOf,
  mondayOf,
  plural,
  reportLabel,
  reportTone,
  taskLabel,
  taskTone,
  weekNumberOf,
  weekRange,
  type Doc,
  type Log,
  type LogFilter,
  type Overview,
  type Pending,
  type RecordContext,
  type Task,
  type TaskFilter,
  type Week,
} from "./model";
import { DecideButtons, GroupTitle, SectionHead, Segmented, Tile, Tiles } from "./RecordParts";

/*
|--------------------------------------------------------------------------
| THE RECORD'S SECTIONS
|--------------------------------------------------------------------------
|
| Each section opens with a few figures, then its records, filtered or
| grouped so the ones that need someone come first. The records and the
| actions on them are the same as before; only their arrangement is new.
|
*/

const supervisorOf = (data: Overview) => data.student.supervisor_name || "The supervisor";

/*
| TIME LOGS
*/

export function AttendanceSection({
  data,
  ctx,
  weeks,
  perf,
  filter,
  onFilter,
}: {
  data: Overview;
  ctx: RecordContext;
  weeks: Week[];
  perf: PerformanceStudent | null;
  filter: LogFilter;
  onFilter: (filter: LogFilter) => void;
}) {
  const p = perf?.performance;
  const all = [...data.attendance].sort((a, b) => (dateKey(a.date) < dateKey(b.date) ? 1 : -1));
  const tests: Record<LogFilter, { label: string; test: (log: Log) => boolean }> = {
    all: { label: "All", test: () => true },
    pending: { label: "Awaiting review", test: (log) => log.status === "Pending" && !isOpenLog(log) },
    open: { label: "No time-out", test: isOpenLog },
    verified: { label: "Verified", test: (log) => log.status === "Verified" },
    rejected: { label: "Rejected", test: (log) => log.status === "Rejected" },
    late: { label: "Late", test: (log) => lateMinutesOf(ctx, log) > 0 },
    corrected: { label: "Corrected", test: (log) => !!log.time_corrected_at },
  };
  const logs = all.filter(tests[filter].test);
  const pager = usePagination(logs, 20);
  const awaiting = data.attendance.filter((log) => log.status === "Pending").reduce((sum, log) => sum + (Number(log.hours) || 0), 0);

  const head = (
    <>
      <SectionHead title="Time logs" description={`Every time-in and time-out, newest first and grouped by week. ${supervisorOf(data)} verifies or rejects each one.`} />
      <Tiles>
        <Tile label="Verified hours" value={<>{formatHours(data.student.hours_rendered)}<small className="text-[13px] font-medium text-slate-500"> of {data.student.required_hours}</small></>} hint={awaiting ? `${formatHours(awaiting)} more awaiting review` : "Nothing awaiting review"} />
        {p && <Tile label="Attendance" value={p.attendance.rate === null ? "–" : `${p.attendance.rate}%`} hint={p.attendance.rate === null ? "No scheduled days yet" : `${p.attendance.attended_days} of ${p.attendance.scheduled_days} scheduled days`} />}
        {p && <Tile label="Late time-ins" value={p.late_time_ins} hint="Late is past the shift's start" />}
        {p && <Tile label="Rejected" value={p.logs_rejected} hint={`${p.logs_corrected} with corrected times`} />}
      </Tiles>
    </>
  );
  if (all.length === 0) return <>{head}<Card><EmptyState icon="clock" title="No attendance logged" /></Card></>;

  let lastWeek = "";
  const rows: ReactNode[] = [];
  const mobile: ReactNode[] = [];
  for (const log of pager.pageItems) {
    const week = mondayOf(dateKey(log.date));
    if (week !== lastWeek) {
      lastWeek = week;
      const inWeek = all.filter((item) => mondayOf(dateKey(item.date)) === week);
      const label = `Week ${weekNumberOf(weeks, week) ?? ""} · ${weekRange(week)}`;
      const total = `${formatHours(inWeek.reduce((sum, item) => sum + (Number(item.hours) || 0), 0))} logged`;
      rows.push(
        <tr key={`w-${week}`} className="bg-slate-50">
          <td colSpan={6} className="px-5 py-2 text-xs font-semibold text-slate-600">{label}<span className="ml-1.5 font-normal text-slate-500">{total}</span></td>
        </tr>
      );
      mobile.push(<li key={`w-${week}`} className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">{label}<span className="ml-1.5 font-normal text-slate-500">{total}</span></li>);
    }
    const late = lateMinutesOf(ctx, log);
    const lateTag = late > 0 && <span className="ml-1.5 rounded-md bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-800">Late</span>;
    const corrected = log.time_corrected_at && <span className="ml-1.5 rounded-md bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600">Corrected</span>;
    const notes = (
      <>
        {log.note || ""}
        {log.review_notes && <span className="block text-slate-500">Reviewer: {log.review_notes}</span>}
      </>
    );
    rows.push(
      <tr key={log.id}>
        <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-900">{formatDayDate(log.date)}</td>
        <td className="tabular whitespace-nowrap px-3 py-3 text-slate-700">{formatTime(log.time_in)}{lateTag}</td>
        <td className="tabular whitespace-nowrap px-3 py-3 text-slate-700">{log.time_out ? formatTime(log.time_out) : "Not recorded"}{corrected}</td>
        <td className="tabular whitespace-nowrap px-3 py-3 text-right text-slate-900">{log.time_out ? formatHours(log.hours) : "—"}</td>
        <td className="min-w-48 px-3 py-3 text-slate-600">{notes}</td>
        <td className="px-5 py-3"><StatusBadge status={log.status} /></td>
      </tr>
    );
    mobile.push(
      <li key={log.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-4 py-3 text-sm">
        <span className="font-medium text-slate-900">{formatDayDate(log.date)}</span>
        <span className="text-right"><StatusBadge status={log.status} /></span>
        <span className="tabular text-slate-700"><span className="text-slate-500">In </span>{formatTime(log.time_in)}{lateTag}</span>
        <span className="tabular row-span-2 self-center text-right font-semibold text-slate-900">{log.time_out ? formatHours(log.hours) : "—"}</span>
        <span className="tabular text-slate-700"><span className="text-slate-500">Out </span>{log.time_out ? formatTime(log.time_out) : "Not recorded"}{corrected}</span>
        {(log.note || log.review_notes) && <span className="col-span-2 text-[13px] text-slate-600">{notes}</span>}
      </li>
    );
  }

  return (
    <>
      {head}
      <div className="mb-3">
        <Segmented
          label="Show logs"
          value={filter}
          onChange={onFilter}
          options={(Object.keys(tests) as LogFilter[])
            .map((key) => ({ value: key, label: tests[key].label, count: all.filter(tests[key].test).length }))
            .filter((option) => option.value === "all" || option.value === filter || option.count > 0)}
        />
      </div>
      <Card>
        {logs.length === 0 ? (
          <EmptyState icon="clock" title="No logs match" description="Choose All to see every log." />
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="table-head border-b border-slate-100 text-xs text-slate-500">
                    <th scope="col" className="px-5 py-3 font-medium">Date</th>
                    <th scope="col" className="px-3 py-3 font-medium">Time in</th>
                    <th scope="col" className="px-3 py-3 font-medium">Time out</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Hours</th>
                    <th scope="col" className="px-3 py-3 font-medium">Notes</th>
                    <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">{rows}</tbody>
              </table>
            </div>
            <ul className="divide-y divide-slate-100 sm:hidden">{mobile}</ul>
          </>
        )}
        <Pagination state={pager} noun="log" />
      </Card>
    </>
  );
}

/*
| TASKS
*/

export function TasksSection({
  data,
  ctx,
  perf,
  filter,
  onFilter,
}: {
  data: Overview;
  ctx: RecordContext;
  perf: PerformanceStudent | null;
  filter: TaskFilter;
  onFilter: (filter: TaskFilter) => void;
}) {
  const p = perf?.performance;
  const tasks = data.tasks;
  const tests: Record<Exclude<TaskFilter, "all">, (task: Task) => boolean> = {
    open: isOpenTask,
    review: (task) => task.status === "Submitted",
    done: (task) => !isOpenTask(task) && task.status !== "Submitted",
    overdue: (task) => isOverdueTask(task, ctx.today),
  };
  const groups: { key: Exclude<TaskFilter, "all" | "overdue">; label: string }[] = [
    { key: "open", label: "Not started or sent back" },
    { key: "review", label: "Waiting for the supervisor's review" },
    { key: "done", label: "Reviewed" },
  ];
  const head = (
    <>
      <SectionHead title="Tasks" description={`Assigned and reviewed by ${data.student.supervisor_name || "the supervisor"}.`} />
      <Tiles>
        {p && <Tile label="On time" value={<>{p.tasks.on_time}<small className="text-[13px] font-medium text-slate-500"> of {p.tasks.assigned}</small></>} hint={`${p.tasks.late} late`} />}
        <Tile label="Open" value={tasks.filter(tests.open).length} hint="Not started or sent back" />
        <Tile label="To review" value={tasks.filter(tests.review).length} hint="Submitted by the student" />
        {p && <Tile label="Average rating" value={p.tasks.average_rating ?? "–"} hint={p.tasks.average_rating ? <Stars value={p.tasks.average_rating} size={13} /> : "None yet"} />}
      </Tiles>
    </>
  );
  if (tasks.length === 0) return <>{head}<Card><EmptyState icon="tasks" title="No tasks assigned" /></Card></>;

  const row = (task: Task) => {
    const overdue = isOverdueTask(task, ctx.today);
    return (
      <li key={task.id} className="px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-semibold text-slate-900">{task.title}</p>
          <StatusBadge status={overdue ? "Overdue" : taskLabel(task.status)} tone={overdue ? "bad" : taskTone(task.status)} />
        </div>
        <p className="mt-0.5 text-sm text-slate-600">
          {isOpenTask(task) ? <span className={overdue ? "font-medium text-red-700" : ""}>{dueLabel(task.due_date)}</span> : `Due ${formatDate(task.due_date)}`}
          {task.assigned_by && ` · assigned by ${task.assigned_by}`}
          {task.priority && ` · ${task.priority} priority`}
        </p>
        {(task.review_notes || (typeof task.review_rating === "number" && task.review_rating > 0)) && (
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {typeof task.review_rating === "number" && task.review_rating > 0 && <Stars value={task.review_rating} />}
            {task.review_notes && (
              <span>
                <span className="font-medium text-slate-700">Supervisor:</span> {task.review_notes}
              </span>
            )}
          </p>
        )}
      </li>
    );
  };
  const list = (items: Task[]) => (
    <Card>{items.length ? <ul className="divide-y divide-slate-100">{items.map(row)}</ul> : <EmptyState icon="tasks" title="No tasks here" />}</Card>
  );

  return (
    <>
      {head}
      <div className="mb-3">
        <Segmented
          label="Show tasks"
          value={filter}
          onChange={onFilter}
          options={[
            { value: "all" as TaskFilter, label: "All", count: tasks.length },
            { value: "open" as TaskFilter, label: "Open", count: tasks.filter(tests.open).length },
            { value: "review" as TaskFilter, label: "To review", count: tasks.filter(tests.review).length },
            { value: "done" as TaskFilter, label: "Reviewed", count: tasks.filter(tests.done).length },
            { value: "overdue" as TaskFilter, label: "Overdue", count: tasks.filter(tests.overdue).length },
          ]}
        />
      </div>
      {filter === "all"
        ? groups.map((group) => {
            const items = tasks.filter(tests[group.key]);
            return items.length ? (
              <div key={group.key}>
                <GroupTitle count={items.length}>{group.label}</GroupTitle>
                {list(items)}
              </div>
            ) : null;
          })
        : list(tasks.filter(tests[filter]))}
    </>
  );
}

/*
| DOCUMENTS
*/

export function DocumentsSection({
  data,
  perf,
  canDecide,
  online,
  onApprove,
  onReject,
}: {
  data: Overview;
  perf: PerformanceStudent | null;
  canDecide: boolean;
  online: boolean;
  onApprove: (item: Pending) => Promise<void>;
  onReject: (item: Pending) => void;
}) {
  const docs = data.documents;
  const p = perf?.performance;
  const first = data.student.name.split(/\s+/)[0] || "The student";
  const head = (
    <>
      <SectionHead title="Documents" description={`The requirements ${first} uploaded. ${supervisorOf(data)} approves or rejects each one.`} />
      <Tiles>
        {p && (
          <Tile label="Requirements approved" value={<>{p.requirements.approved}<small className="text-[13px] font-medium text-slate-500"> of {p.requirements.required}</small></>} hint={`${Math.max(0, p.requirements.required - p.requirements.approved)} still to go`}>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-psu-50">
              <div className="h-full rounded-full bg-psu-500" style={{ width: `${p.requirements.required ? (p.requirements.approved / p.requirements.required) * 100 : 0}%` }} />
            </div>
          </Tile>
        )}
        <Tile label="Awaiting a decision" value={docs.filter((doc) => doc.status === "Pending").length} hint={canDecide ? "You can decide these" : "The supervisor decides these"} />
        <Tile label="Rejected" value={docs.filter((doc) => doc.status === "Rejected").length} hint="Waiting for a new upload" />
      </Tiles>
    </>
  );
  if (docs.length === 0) return <>{head}<Card><EmptyState icon="document" title="No documents submitted" /></Card></>;
  const row = (item: Doc) => {
    const pending: Pending = { kind: "document", id: item.id, label: item.doc_type };
    return (
      <li key={item.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
        <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg bg-psu-50 text-psu-700 ring-1 ring-inset ring-psu-600/10 sm:grid"><Icon name="document" size={16} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{item.doc_type}</p>
          <p className="truncate text-xs text-slate-500">
            {item.original_filename} · {formatFileSize(Number(item.size_bytes))} · {formatDate(item.uploaded_at)}
          </p>
          {item.review_notes && <p className="mt-1 text-sm text-slate-600">Note: {item.review_notes}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusBadge status={item.status === "Pending" ? "Awaiting review" : item.status} tone={item.status === "Pending" ? "waiting" : undefined} />
          <button
            type="button"
            onClick={() => {
              if (!online) return toast.info("You're offline. The document can be downloaded once your connection is back.");
              downloadSubmittedDocument(item.id, item.original_filename).catch((downloadError: unknown) =>
                toast.error(errorText(downloadError, "The document could not be downloaded."))
              );
            }}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-psu-700 hover:bg-psu-50 pointer-coarse:py-2.5"
          >
            <Icon name="download" size={15} />
            Download
          </button>
          {canDecide && item.status === "Pending" && (
            <DecideButtons approveLabel="Approve" rejectLabel="Reject" onApprove={() => onApprove(pending)} onReject={() => onReject(pending)} online={online} />
          )}
        </div>
      </li>
    );
  };
  return (
    <>
      {head}
      {(
        [
          ["Pending", "Needs a decision"],
          ["Rejected", "Rejected"],
          ["Approved", "Approved"],
        ] as const
      ).map(([status, label]) => {
        const items = docs.filter((doc) => doc.status === status);
        return items.length ? (
          <div key={status}>
            <GroupTitle count={items.length}>{label}</GroupTitle>
            <Card><ul className="divide-y divide-slate-100">{items.map(row)}</ul></Card>
          </div>
        ) : null;
      })}
    </>
  );
}

/*
| EVALUATIONS
*/

export function EvaluationsSection({ data, perf, final }: { data: Overview; perf: PerformanceStudent | null; final: FinalEvaluation | null }) {
  const p = perf?.performance;
  const evaluations = data.evaluations;
  const groups = [
    ["supervisor", "From the supervisor"],
    ["teacher", "From the coordinator"],
    ["student", "The student, about their company"],
  ] as const;
  return (
    <>
      <SectionHead title="Evaluations" description="Star ratings from the supervisor and the coordinator, the student's rating of the company, and the final evaluation." />
      <Tiles>
        {p && <Tile label="Supervisor's star ratings" value={p.supervisor_rating ?? "–"} hint={p.supervisor_rating ? <Stars value={p.supervisor_rating} size={13} /> : "None yet"} />}
        <Tile label="Final evaluation" value={final ? <>{final.average}<small className="text-[13px] font-medium text-slate-500"> of {final.form_snapshot.scale_max}</small></> : "Not yet"} hint={final ? `Submitted ${formatDate(final.submitted_at)}` : "Submitted once the hours are done"} />
        <Tile label="Ratings recorded" value={evaluations.length} hint={`${evaluations.filter((item) => item.evaluator_type === "supervisor").length} by the supervisor`} />
      </Tiles>
      {final && (
        <Card className="mb-4">
          <div className="flex items-center gap-2.5 px-4 pt-4 sm:px-5">
            <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-gold-50 text-gold-700 ring-1 ring-inset ring-gold-600/20"><Icon name="star" size={15} /></span>
            <h3 className="text-sm font-semibold text-slate-900">Final evaluation</h3>
          </div>
          <div className="mt-3 border-t border-slate-100 px-4 py-4 sm:px-5">
            <FinalEvaluationView evaluation={final} />
          </div>
        </Card>
      )}
      {evaluations.length === 0 ? (
        <Card><EmptyState icon="star" title="No evaluations yet" /></Card>
      ) : (
        groups.map(([type, label]) => {
          const items = evaluations.filter((item) => item.evaluator_type === type);
          return items.length ? (
            <div key={type}>
              <GroupTitle count={items.length}>{label}</GroupTitle>
              <Card>
                <ul className="divide-y divide-slate-100">
                  {items.map((item) => (
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
                      {item.comments && <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600">{item.comments}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : null;
        })
      )}
    </>
  );
}

/*
| WEEKLY REPORTS
*/

export function JournalsSection({
  data,
  weeks,
  perf,
  open,
  onOpenChange,
}: {
  data: Overview;
  weeks: Week[];
  perf: PerformanceStudent | null;
  /** Week starts of the reports shown open. */
  open: string[];
  onOpenChange: (open: string[]) => void;
}) {
  const journals = [...(data.journals || [])].sort((a, b) => (dateKey(a.week_start) < dateKey(b.week_start) ? 1 : -1));
  const p = perf?.performance;
  const first = data.student.name.split(/\s+/)[0] || "The student";
  const allOpen = journals.length > 0 && journals.every((item) => open.includes(dateKey(item.week_start)));
  return (
    <>
      <SectionHead
        title="Weekly reports"
        description={`${first} writes one a week and ${data.student.supervisor_name || "the supervisor"} reviews it. Open a week to read it beside what was written at each time-out.`}
        action={
          journals.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenChange(allOpen ? [] : journals.map((item) => dateKey(item.week_start)))}
              className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 pointer-coarse:h-10"
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          )
        }
      />
      <Tiles>
        {p && <Tile label="Written" value={<>{p.weekly_reports.submitted}<small className="text-[13px] font-medium text-slate-500"> for {plural(p.weekly_reports.weeks_worked, "week", "weeks")}</small></>} hint="worked" />}
        <Tile label="Reviewed" value={journals.filter((item) => item.status === "Reviewed").length} />
        <Tile label="Waiting" value={journals.filter((item) => item.status === "Submitted").length} hint="for the supervisor" />
        <Tile label="Returned" value={journals.filter((item) => item.status === "Returned").length} hint="to the student" />
      </Tiles>
      {journals.length === 0 ? (
        <Card><EmptyState icon="note" title="No weekly reports yet" description="The student writes one a week, and their supervisor reviews it." /></Card>
      ) : (
        <div className="space-y-2.5">
          {journals.map((item) => {
            const week = dateKey(item.week_start);
            const isOpen = open.includes(week);
            return (
              <details
                key={item.id}
                id={`report-${week}`}
                open={isOpen}
                onToggle={(event) => {
                  const now = (event.currentTarget as HTMLDetailsElement).open;
                  if (now !== isOpen) onOpenChange(now ? [...open, week] : open.filter((value) => value !== week));
                }}
                className="group scroll-mt-28 rounded-2xl border border-slate-200/80 bg-white shadow-card"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3.5 hover:bg-slate-50 group-open:rounded-b-none group-open:border-b group-open:border-slate-100 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-psu-50 text-psu-700 ring-1 ring-inset ring-psu-600/10"><Icon name="note" size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[14.5px] font-semibold text-slate-900">Week {weekNumberOf(weeks, week) ?? ""} · week of {formatDate(week)}</b>
                    <span className="block truncate text-xs text-slate-500">{item.activities}</span>
                  </span>
                  <span className="hidden sm:inline-flex"><StatusBadge status={reportLabel(item.status)} tone={reportTone(item.status)} /></span>
                  <Icon name="chevron-right" size={15} className="shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
                </summary>
                <div className="space-y-2.5 px-4 py-4 sm:px-5">
                  <span className="sm:hidden"><StatusBadge status={reportLabel(item.status)} tone={reportTone(item.status)} /></span>
                  <div className="grid gap-x-6 gap-y-2.5 md:grid-cols-2">
                    <ReportParts report={item} />
                  </div>
                  <EntryPictures role="coordinator" owner="journal" ownerId={item.id} count={item.pictures} className="" />
                  <DailyAccomplishments weekStart={week} logs={data.attendance} />
                  {item.review_notes && (
                    <p className="rounded-md bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700">
                      <span className="font-semibold">Supervisor:</span> {item.review_notes}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">Submitted {formatDate(item.submitted_at)}</p>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}

/*
| SCHEDULE, TIME RECORD, NOTES: the components the page always used.
*/

export function ScheduleSection({ data, onSaved }: { data: Overview; onSaved: () => void }) {
  return (
    <>
      <SectionHead title="Schedule" description="The days and hours this student reports for OJT, every week or every two weeks. They see it on their Schedule page, and their expected end date is worked out from it." />
      <Card>
        <div className="px-4 py-4 sm:px-5">
          <ScheduleEditor
            key={data.student.student_id}
            studentId={data.student.student_id}
            studentName={data.student.name}
            requiredHours={data.student.required_hours}
            onSaved={onSaved}
          />
        </div>
      </Card>
    </>
  );
}

export function TimeRecordSection({ data, holidays, certifications }: { data: Overview; holidays: Holiday[]; certifications: DtrCertification[] }) {
  const student = data.student;
  return (
    <>
      <div className="print:hidden">
        <SectionHead title="Time record" description="A Daily Time Record for one month, in the Civil Service form's four columns, with signature lines." />
      </div>
      <DtrSheet
        viewer="coordinator"
        loading={false}
        person={{ name: student.name, studentId: student.student_id, program: student.program, company: student.company, supervisor: student.supervisor_name }}
        logs={data.attendance}
        absences={data.absences}
        holidays={holidays}
        certifications={certifications}
      />
    </>
  );
}

export function NotesSection({ data }: { data: Overview }) {
  const student = data.student;
  return (
    <>
      <SectionHead title="Notes with the supervisor" />
      <Card className="p-4 sm:p-5">
        {student.supervisor_name ? (
          <StudentNotes key={student.student_id} studentId={student.student_id} studentName={student.name} role="coordinator" />
        ) : (
          <p className="text-sm text-slate-600">This student has no supervisor yet, so there is nobody to write to. Assign one first.</p>
        )}
      </Card>
    </>
  );
}
