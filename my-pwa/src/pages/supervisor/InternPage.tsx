import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import DtrSheet from "../../components/DtrSheet";
import Icon from "../../components/Icon";
import MonthCalendar from "../../components/MonthCalendar";
import ProjectionLine from "../../components/ProjectionLine";
import StudentNotes from "../../components/StudentNotes";
import EntryPictures from "../../components/EntryPictures";
import { DailyAccomplishments, ReportParts } from "../../components/WeeklyReport";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  FilterChips,
  Modal,
  ProgressBar,
  SkeletonRows,
  StatTile,
  StatusBadge,
} from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import {
  dueLabel,
  formatDate,
  formatDayDate,
  formatHours,
  formatTime,
} from "../../lib/format";
import { useAccount } from "../../lib/session";
import { LATE_AFTER_MINUTES } from "../../lib/studentCalendar";
import { daysWaiting, lateDays, minutesText } from "../../lib/supervisorDay";
import { errorText, toast } from "../../lib/toast";
import { changeDtrCertification, useDtrCertifications } from "../../lib/useDtrCertifications";
import { useHolidays } from "../../lib/useHolidays";
import { useProjections } from "../../lib/useProjections";
import EvaluationPanel from "./EvaluationPanel";
import { nearlyDone, useFinalDue } from "./finalDue";
import { fetchFinalEvaluation, internSummarySections } from "./internSummary";
import { INTERN_TAB_LABELS, INTERN_TABS, type InternTab } from "./internPath";
import ReviewDetail from "./ReviewDetail";
import { useInternSchedules } from "./useInternSchedules";
import {
  downloadDocument,
  useSupervisorWork,
  type Intern,
  type QueueItem,
  type SupervisorWork,
} from "./useSupervisorWork";

/*
|--------------------------------------------------------------------------
| ONE INTERN
|--------------------------------------------------------------------------
|
| Everything a supervisor has about one of their interns, in sections:
| where they stand, their month, their tasks, documents and weekly reports,
| the evaluations to write, the time record to certify, and the notes
| shared with the OJT coordinator. It is put together from the lists the
| supervisor's pages already load, narrowed to this intern.
|
| "?tab=" in the address opens a section, so a notification or the Review
| queue can lead straight to it.
|
*/

const KIND_WORD: Record<QueueItem["kind"], string> = {
  attendance: "Attendance log",
  task: "Task submitted",
  document: "Document",
  absence: "Absence",
  journal: "Weekly report",
};

function clockTime(value: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || "");
  if (!match) return "";
  const hour = Number(match[1]);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

export default function SupervisorInternPage() {
  const supervisor = useAccount("supervisor");
  const work = useSupervisorWork(supervisor?.supervisor_id);
  const { studentId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab") as InternTab | null;
  const tab: InternTab = asked && INTERN_TABS.includes(asked) ? asked : "overview";
  const setTab = (next: InternTab) => setParams(next === "overview" ? {} : { tab: next }, { replace: true });

  const intern = work.interns.find((item) => item.student_id === studentId);
  const [reviewKey, setReviewKey] = useState<string | null>(null);
  const reviewing = work.queue.find((item) => item.key === reviewKey);

  const back = (
    <Link
      to="/supervisor/interns"
      className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 print:hidden"
    >
      <Icon name="chevron-right" size={15} className="rotate-180" />
      All interns
    </Link>
  );

  if (!intern) {
    return (
      <SupervisorLayout title="Intern" subtitle="One intern's record." actions={back}>
        {work.error ? (
          <ErrorNotice message={work.error} onRetry={() => void work.reload()} />
        ) : work.loading ? (
          <Card>
            <SkeletonRows rows={5} />
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon="users"
              title="This is not one of your interns"
              description="They may have been assigned to another supervisor, or the address is not right."
              action={
                <Link to="/supervisor/interns" className="text-sm font-semibold text-psu-700 hover:underline">
                  See your interns
                </Link>
              }
            />
          </Card>
        )}
      </SupervisorLayout>
    );
  }

  return (
    <SupervisorLayout
      title={intern.name}
      subtitle={[intern.student_id, intern.block_name || intern.program_code || intern.program].filter(Boolean).join(" · ")}
      actions={back}
    >
      <div className="space-y-5">
        {work.error && <ErrorNotice message={work.error} onRetry={() => void work.reload()} />}

        <div className="print:hidden">
          <FilterChips
            label="Section"
            value={tab}
            onChange={setTab}
            options={INTERN_TABS.map((value) => ({ value, label: INTERN_TAB_LABELS[value] }))}
          />
        </div>

        {tab === "overview" && <Overview intern={intern} work={work} onReview={setReviewKey} />}
        {tab === "attendance" && <Attendance intern={intern} work={work} />}
        {tab === "tasks" && <Tasks intern={intern} work={work} onReview={setReviewKey} />}
        {tab === "documents" && <Documents intern={intern} work={work} onReview={setReviewKey} />}
        {tab === "reports" && <Reports intern={intern} work={work} onReview={setReviewKey} />}
        {tab === "evaluate" && <EvaluationPanel key={intern.student_id} intern={intern} />}
        {tab === "record" && <TimeRecord intern={intern} work={work} supervisorName={supervisor?.name} />}
        {tab === "notes" && (
          <Card className="p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900">Notes with the coordinator</h2>
            <div className="mt-2">
              <StudentNotes
                key={intern.student_id}
                studentId={intern.student_id}
                studentName={intern.name}
                role="supervisor"
              />
            </div>
          </Card>
        )}
      </div>

      <Modal
        open={Boolean(reviewing)}
        onClose={() => setReviewKey(null)}
        title={reviewing ? KIND_WORD[reviewing.kind] : ""}
        description={intern.name}
        size="lg"
      >
        {reviewing && <ReviewDetail item={reviewing} work={work} onDecided={() => setReviewKey(null)} />}
      </Modal>
    </SupervisorLayout>
  );
}

type TabProps = { intern: Intern; work: SupervisorWork };
type Reviewable = TabProps & { onReview: (key: string) => void };

function queueTitle(item: QueueItem): string {
  if (item.kind === "attendance") return `Attendance · ${formatDayDate(item.entry.date)}`;
  if (item.kind === "task") return item.entry.title;
  if (item.kind === "absence") return `Absence · ${formatDayDate(item.entry.date)}`;
  if (item.kind === "journal") return `Weekly report · week of ${formatDayDate(item.entry.week_start)}`;
  return item.entry.doc_type;
}

/*
| Overview
*/

function Overview({ intern, work, onReview }: Reviewable) {
  const projections = useProjections("supervisor");
  const projection = projections.get(intern.student_id);
  const schedules = useInternSchedules();
  const shifts = schedules?.get(intern.student_id);
  const waiting = work.queue.filter((item) => item.entry.student_id === intern.student_id);
  const finalDue = useFinalDue(work.interns).some((item) => item.entry.student_id === intern.student_id);
  const [, setParams] = useSearchParams();
  const [buildingPdf, setBuildingPdf] = useState(false);

  // Everything about this intern as one PDF, from what is on the page.
  const downloadSummary = async () => {
    setBuildingPdf(true);
    try {
      // Loaded on demand so the PDF library is not part of every page load.
      const [{ buildAnalyticsPdf }, evaluation] = await Promise.all([
        import("../../lib/analyticsPdf"),
        fetchFinalEvaluation(intern.student_id),
      ]);
      const mine = <T extends { student_id: string }>(list: T[]) =>
        list.filter((entry) => entry.student_id === intern.student_id);
      buildAnalyticsPdf(
        internSummarySections({
          intern,
          logs: mine(work.attendance),
          tasks: mine(work.tasks),
          documents: mine(work.documents),
          projection,
          evaluation,
        }),
        new Date().toLocaleString(),
        `OJT Summary: ${intern.name}`
      ).save(`internet-summary-${intern.student_id}.pdf`);
      toast.success("Summary PDF ready.");
    } catch (pdfError) {
      toast.error(errorText(pdfError, "The summary could not be prepared."));
    } finally {
      setBuildingPdf(false);
    }
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card className="p-4 sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">Hours</h2>
        <div className="mt-3 flex items-baseline justify-between text-sm">
          <span className="text-slate-600">Verified</span>
          <span className="tabular font-medium text-slate-900">
            {formatHours(intern.hours_rendered)} of {formatHours(intern.required_hours)} ({intern.completion}%)
          </span>
        </div>
        <ProgressBar
          value={intern.completion}
          className="mt-2"
          label={`${intern.completion} percent of required hours`}
        />
        <ProjectionLine projection={projection} className="mt-2" />
        <div className="mt-4">
          <Button
            variant="secondary"
            icon="download"
            busy={buildingPdf}
            busyProcess="export"
            onClick={() => void downloadSummary()}
          >
            {buildingPdf ? "Preparing" : "Summary PDF"}
          </Button>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">Contact</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Fact label="Email">
            <a href={`mailto:${intern.email}`} className="break-all font-medium text-psu-700 hover:underline">
              {intern.email}
            </a>
          </Fact>
          <Fact label="Mobile">
            {intern.phone ? (
              <a href={`tel:${intern.phone}`} className="font-medium text-psu-700 underline underline-offset-2 hover:text-psu-900">
                {intern.phone}
              </a>
            ) : (
              "Not given"
            )}
          </Fact>
          <Fact label="In an emergency">
            {intern.emergency_contact_phone ? (
              <>
                {intern.emergency_contact_name ? `${intern.emergency_contact_name}, ` : ""}
                <a href={`tel:${intern.emergency_contact_phone}`} className="font-medium text-psu-700 underline underline-offset-2 hover:text-psu-900">
                  {intern.emergency_contact_phone}
                </a>
              </>
            ) : (
              "Not given"
            )}
          </Fact>
          <Fact label="Program">{intern.program || intern.program_code || "Not set"}</Fact>
          <Fact label="Block">{intern.block_name || "Not placed in a block"}</Fact>
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="Waiting for you"
          description={
            waiting.length + (finalDue ? 1 : 0) === 0
              ? "Nothing of this intern's is waiting."
              : "Oldest first."
          }
        />
        {waiting.length + (finalDue ? 1 : 0) === 0 && <div className="pb-4" />}
        {waiting.length + (finalDue ? 1 : 0) > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
            {waiting.map((item) => {
              const days = daysWaiting(item.waitingSince);
              return (
                <li key={item.key} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{queueTitle(item)}</p>
                    <p className="text-sm text-slate-600">
                      {days === 0 ? "Since today" : `Waiting ${days} ${days === 1 ? "day" : "days"}`}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => onReview(item.key)}>
                    Review
                  </Button>
                </li>
              );
            })}
            {finalDue && (
              <li className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">Final evaluation due</p>
                  <p className="text-sm text-slate-600">
                    {nearlyDone(intern) && intern.hours_rendered >= intern.required_hours
                      ? "The required hours are complete."
                      : "The required hours are nearly complete."}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => setParams({ tab: "evaluate" })}>
                  Evaluate
                </Button>
              </li>
            )}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Weekly schedule" description="Set by the OJT coordinator." />
        {schedules === null ? (
          <SkeletonRows rows={3} />
        ) : !shifts || shifts.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-slate-600 sm:px-5">
            The OJT coordinator has not set a schedule for this intern yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
            {shifts.map((shift) => (
              <li
                key={shift.day}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm sm:px-5"
              >
                <span className="min-w-0">
                  <span className="font-medium text-slate-900">{shift.day}</span>
                  {shift.focus && <span className="text-slate-600"> · {shift.focus}</span>}
                </span>
                <span className="tabular shrink-0 text-slate-700">
                  {clockTime(shift.start_time)} – {clockTime(shift.end_time)}
                  {shift.hours !== null && ` · ${formatHours(shift.hours)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-slate-600">{label}</dt>
      <dd className="min-w-0 text-right text-slate-900">{children}</dd>
    </div>
  );
}

/*
| Attendance
*/

function Attendance({ intern, work }: TabProps) {
  const holidays = useHolidays("supervisor");
  const schedules = useInternSchedules();
  const shifts = useMemo(() => schedules?.get(intern.student_id) ?? [], [schedules, intern.student_id]);
  const logs = useMemo(
    () => work.attendance.filter((entry) => entry.student_id === intern.student_id),
    [work.attendance, intern.student_id]
  );
  const absences = useMemo(
    () => work.absences.filter((entry) => entry.student_id === intern.student_id),
    [work.absences, intern.student_id]
  );
  const tasks = useMemo(
    () => work.tasks.filter((entry) => entry.student_id === intern.student_id && !entry.scheduled),
    [work.tasks, intern.student_id]
  );

  const totals = useMemo(() => {
    const sum = (status: string) =>
      logs.filter((log) => log.status === status).reduce((hours, log) => hours + (Number(log.hours) || 0), 0);
    return { verified: sum("Verified"), pending: sum("Pending"), days: logs.length };
  }, [logs]);
  const late = useMemo(() => lateDays(logs, shifts), [logs, shifts]);
  const corrected = logs.filter((log) => log.time_corrected_at);
  const offline = logs.filter((log) => log.recorded_offline);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Hours verified" value={formatHours(totals.verified)} icon="clock" tone="gold" />
        <StatTile
          label="Hours not yet verified"
          value={formatHours(totals.pending)}
          icon="clipboard"
          tone={totals.pending > 0 ? "waiting" : "neutral"}
        />
        <StatTile label="Days logged" value={totals.days} icon="calendar" />
        <StatTile
          label="Absences filed"
          value={absences.length}
          hint={`${late.length} late ${late.length === 1 ? "time-in" : "time-ins"}`}
          icon="alert"
          tone={absences.length > 0 ? "bad" : "neutral"}
        />
      </div>

      {work.loading ? (
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      ) : (
        <MonthCalendar
          reader="staff"
          shifts={shifts}
          holidays={holidays}
          logs={logs}
          absences={absences}
          tasks={tasks}
          termStart={null}
        />
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <DayList
          title="Late time-ins"
          description={`More than ${LATE_AFTER_MINUTES} minutes after the shift's start, against the schedule as it is now.`}
          empty="No late time-in."
          rows={late.map((day) => ({
            key: day.date,
            date: day.date,
            detail: `${minutesText(day.minutes)} after the start`,
          }))}
        />
        <DayList
          title="Absences"
          description="Each absence this intern filed, and what was decided."
          empty="No absence filed."
          rows={[...absences]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((absence) => ({
              key: String(absence.id),
              date: absence.date,
              detail: absence.reason,
              status: absence.status === "Pending" ? "Waiting for you" : absence.status,
            }))}
        />
        <DayList
          title="Logs with corrected times"
          description="Days whose times you set by hand, with the reason you gave."
          empty="No log has had its times corrected."
          rows={corrected.map((log) => ({
            key: String(log.id),
            date: log.date,
            detail: log.time_correction_reason || "No reason recorded",
          }))}
        />
        <DayList
          title="Logs recorded offline"
          description="At least one step's time came from the intern's phone while it had no connection."
          empty="No log was recorded offline."
          rows={offline.map((log) => ({
            key: String(log.id),
            date: log.date,
            detail: `${formatTime(log.time_in)} to ${log.time_out ? formatTime(log.time_out) : "still open"}`,
            status: log.status,
          }))}
        />
      </div>
    </div>
  );
}

function DayList({
  title,
  description,
  empty,
  rows,
}: {
  title: string;
  description: string;
  empty: string;
  rows: { key: string; date: string; detail: string; status?: string }[];
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 5);
  return (
    <Card>
      <CardHeader title={`${title} (${rows.length})`} description={description} />
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-slate-600 sm:px-5">{empty}</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {shown.map((row) => (
              <li key={row.key} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                <span className="min-w-0">
                  <span className="font-medium text-slate-900">{formatDayDate(row.date)}</span>
                  <span className="block break-words text-slate-600">{row.detail}</span>
                </span>
                {row.status && <StatusBadge status={row.status} />}
              </li>
            ))}
          </ul>
          {rows.length > 5 && (
            <button
              type="button"
              onClick={() => setAll((value) => !value)}
              className="w-full border-t border-slate-100 px-4 py-2.5 text-left text-sm font-semibold text-psu-700 hover:bg-slate-50 sm:px-5"
            >
              {all ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

/*
| Tasks, documents, weekly reports: this intern's only
*/

function Tasks({ intern, work, onReview }: Reviewable) {
  const tasks = work.tasks.filter((task) => task.student_id === intern.student_id);
  return (
    <Card>
      <CardHeader
        title={`Tasks (${tasks.length})`}
        description="Assign, change or cancel a task on the Tasks page."
        action={
          <Link
            to={`/supervisor/tasks?intern=${encodeURIComponent(intern.student_id)}`}
            className="text-sm font-semibold text-psu-700 hover:underline"
          >
            Open Tasks
          </Link>
        }
      />
      {work.loading ? (
        <SkeletonRows rows={4} />
      ) : tasks.length === 0 ? (
        <EmptyState icon="tasks" title="No tasks assigned yet" />
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {tasks.map((task) => {
            const open = task.status === "Pending" || task.status === "In Progress";
            const label = task.scheduled
              ? "Scheduled"
              : task.status === "Pending"
                ? "Not started"
                : task.status === "In Progress"
                  ? "Sent back"
                  : task.status === "Submitted"
                    ? "To review"
                    : "Reviewed";
            return (
              <li key={task.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-slate-900">{task.title}</p>
                  <p className="text-sm text-slate-600">
                    {task.scheduled && task.release_day
                      ? `The intern will see it on ${formatDate(task.release_day)} · due ${formatDate(task.due_date)}`
                      : open
                        ? dueLabel(task.due_date)
                        : `Due ${formatDate(task.due_date)}`}
                    {task.team_name && ` · Team: ${task.team_name}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge
                    status={label}
                    tone={
                      task.status === "Submitted"
                        ? "waiting"
                        : task.status === "Reviewed"
                          ? "good"
                          : task.status === "In Progress"
                            ? "info"
                            : "neutral"
                    }
                  />
                  {task.status === "Submitted" && (
                    <Button variant="secondary" onClick={() => onReview(`task-${task.id}`)}>
                      Review
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Documents({ intern, work, onReview }: Reviewable) {
  const documents = work.documents.filter((entry) => entry.student_id === intern.student_id);
  const download = async (entry: (typeof documents)[number]) => {
    try {
      await downloadDocument(entry);
    } catch (error) {
      toast.error(errorText(error, "The document could not be downloaded."));
    }
  };
  return (
    <Card>
      <CardHeader title={`Documents (${documents.length})`} description="What this intern has uploaded." />
      {work.loading ? (
        <SkeletonRows rows={4} />
      ) : documents.length === 0 ? (
        <EmptyState icon="document" title="No documents uploaded yet" />
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {documents.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-slate-900">{entry.doc_type}</p>
                <p className="truncate text-sm text-slate-600">
                  {entry.original_filename} · {formatDate(entry.uploaded_at)}
                </p>
                {entry.status === "Rejected" && entry.review_notes && (
                  <p className="mt-0.5 break-words text-sm text-slate-600">Your note: {entry.review_notes}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={entry.status === "Pending" ? "Waiting for you" : entry.status} />
                {entry.status === "Pending" ? (
                  <Button variant="secondary" onClick={() => onReview(`document-${entry.id}`)}>
                    Review
                  </Button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void download(entry)}
                    aria-label={`Download ${entry.doc_type}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
                  >
                    <Icon name="download" size={16} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Reports({ intern, work, onReview }: Reviewable) {
  const reports = work.journals
    .filter((entry) => entry.student_id === intern.student_id)
    .sort((a, b) => b.week_start.localeCompare(a.week_start));
  const logs = work.attendance.filter((entry) => entry.student_id === intern.student_id);
  const STATE = {
    Submitted: { label: "Waiting for you", tone: "waiting" },
    Reviewed: { label: "Reviewed", tone: "good" },
    Returned: { label: "Returned to the intern", tone: "bad" },
  } as const;
  return (
    <Card>
      <CardHeader title={`Weekly reports (${reports.length})`} description="One a week, written by the intern." />
      {work.loading ? (
        <SkeletonRows rows={4} />
      ) : reports.length === 0 ? (
        <EmptyState icon="note" title="No weekly report yet" />
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {reports.map((report) => (
            <li key={report.id} className="px-4 py-3 sm:px-5">
              <details>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">
                      Week of {formatDate(report.week_start)}
                    </span>
                    <span className="block text-sm text-slate-600">Sent {formatDate(report.submitted_at)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={STATE[report.status].label} tone={STATE[report.status].tone} />
                    <Icon name="chevron-down" size={16} className="text-slate-600" />
                  </span>
                </summary>
                <div className="mt-3 space-y-3">
                  <ReportParts report={report} />
                  <EntryPictures role="supervisor" owner="journal" ownerId={report.id} className="" />
                  <DailyAccomplishments weekStart={report.week_start} logs={logs} />
                  {report.review_notes && (
                    <p className="break-words text-sm text-slate-700">
                      <span className="font-medium">Your note:</span> {report.review_notes}
                    </p>
                  )}
                  {report.status === "Submitted" && (
                    <Button variant="secondary" onClick={() => onReview(`journal-${report.id}`)}>
                      Review
                    </Button>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/*
| Time record, with the month's certification
*/

function TimeRecord({ intern, work, supervisorName }: TabProps & { supervisorName?: string }) {
  const holidays = useHolidays("supervisor");
  const dtr = useDtrCertifications("supervisor", intern.student_id);
  return (
    <DtrSheet
      key={intern.student_id}
      loading={work.loading}
      person={{
        name: intern.name,
        studentId: intern.student_id,
        program: intern.program,
        company: intern.company,
        supervisor: supervisorName,
      }}
      logs={work.attendance.filter((entry) => entry.student_id === intern.student_id)}
      absences={work.absences.filter((entry) => entry.student_id === intern.student_id)}
      holidays={holidays}
      certifications={dtr.certifications}
      onCertify={async (month) => {
        toast.success(await changeDtrCertification({ certify: { student_id: intern.student_id, month } }));
        await dtr.reload();
      }}
      onWithdraw={async (id) => {
        toast.success(await changeDtrCertification({ withdraw: id }));
        await dtr.reload();
      }}
    />
  );
}

