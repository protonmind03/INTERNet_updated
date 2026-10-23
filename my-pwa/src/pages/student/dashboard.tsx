import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HoursRoad } from "../../brand/motifs";
import Icon, { type IconName } from "../../components/Icon";
import InfoTip from "../../components/InfoTip";
import type { Tone } from "../../components/tones";
import { Card, ErrorNotice, IconTile, Skeleton, SkeletonRows } from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import { daysUntil, dueLabel, formatDate, formatHours, greetingFor } from "../../lib/format";
import { useLaunchReady } from "../../lib/launch";
import { savedFetch } from "../../lib/offlineStore";
import { formatPhDay, phToday } from "../../lib/phTime";
import { useAccount } from "../../lib/session";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { useProjections } from "../../lib/useProjections";
import { appealUntil, appealableKinds } from "./appealRules";
import { LateTimeOutDialog } from "./AttendanceCorrections";
import { PhotoRedoBanner } from "./PhotoRedo";
import TimeInProvider from "./TimeInProvider";
import TodayCard from "./TodayCard";
import { useTimeIn } from "./timeInContext";
import { logDateKey } from "./useAttendance";
import QrHandOff from "../../components/QrHandOff";

/*
|--------------------------------------------------------------------------
| TODAY (PSU redesign, 7A)
|--------------------------------------------------------------------------
|
| In order: the greeting and the date; the time card (TodayCard.tsx); one
| red "Needs you" row for each thing to act on (a photo to retake, a
| missed time-out, a decision that can still be appealed, an overdue
| task); OJT hours as a road with the expected finish, an "i" saying only
| verified days count; shortcuts as hairline rows; and Up next. One line
| per card: explanations sit behind the "i" or in Help. On a tablet or
| computer the time card is larger, in two columns, with the hand-off to
| the phone for time-in.
|
*/

type DashboardData = {
  hoursRendered: number;
  requiredHours: number;
  daysLogged: number;
  activeTasks: number;
  completion: number;
  totalTasks: number;
  completedTasks: number;
  /** When verified hours first reached the requirement, if they have. */
  completedAt?: string | null;
};

type Task = {
  id: number;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  assigned_by: string | null;
};

const OPEN_TASK_STATUSES = ["Pending", "In Progress"];

/** Mounts the shared time-in actions above the page, which reads the attendance before it renders the layout. */
export default function Dashboard() {
  return (
    <TimeInProvider>
      <DashboardPage />
    </TimeInProvider>
  );
}

function DashboardPage() {
  const student = useAccount("student");
  const studentId = student?.student_id;
  const { attendance } = useTimeIn();
  const wide = useMediaQuery("(min-width: 1024px)");

  const [summary, setSummary] = useState<DashboardData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  // The completion checklist's lines (documents, hours…), for the shortcuts' status.
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  useLaunchReady(!loading);

  const load = useCallback(async () => {
    if (!studentId) return;
    const id = encodeURIComponent(studentId);
    try {
      const [summaryResponse, tasksResponse, checklistResponse] = await Promise.all([
        savedFetch("student", "dashboard", `${API_URL}/api/dashboard/${id}`, withStudentAuth()),
        savedFetch("student", "tasks", `${API_URL}/api/tasks/student/${id}`, withStudentAuth()),
        // Extra to Today: without it the shortcuts simply show no status.
        savedFetch("student", "completion", `${API_URL}/api/students/${id}/completion`, withStudentAuth()).catch(() => null),
      ]);
      if (!summaryResponse.ok) throw new Error("Could not load your progress.");
      setSummary((await summaryResponse.json()) as DashboardData);
      if (tasksResponse.ok) {
        const list = await tasksResponse.json();
        setTasks(Array.isArray(list) ? (list as Task[]) : []);
      }
      if (checklistResponse?.ok) {
        const data = await checklistResponse.json().catch(() => ({}));
        setChecklist(Array.isArray(data.items) ? (data.items as ChecklistItem[]) : []);
      }
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof TypeError
          ? "Can't reach the server. Check your connection and try again."
          : loadError instanceof Error
            ? loadError.message
            : "Could not load your progress."
      );
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

  const openTasks = useMemo(
    () =>
      tasks
        .filter((task) => OPEN_TASK_STATUSES.includes(task.status))
        .sort((a, b) => {
          const left = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const right = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          return left - right;
        }),
    [tasks]
  );
  const overdueTasks = openTasks.filter((task) => (daysUntil(task.due_date) ?? 0) < 0).length;
  // Decisions that can still be appealed, newest first.
  const appealable = attendance.logs.filter((log) => appealableKinds(log).length > 0 && (log.status === "Rejected" || log.photo_rejected_at || log.time_corrected_at));
  const missed = attendance.openPastLog;

  const firstName = (student?.name || "").trim().split(/\s+/)[0] || "there";
  const timeCard = <TodayCard large={wide} />;

  const needs = (
    <div className="space-y-2.5" aria-label="Needs you">
      <PhotoRedoBanner />
      {missed && (
        <button type="button" onClick={() => setClosing(true)} className="needs-row w-full text-left">
          <Icon name="clock" className="shrink-0 text-(--status-late-ink)" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-(--status-late-ink)">Enter your missed time-out</span>
            <span className="block text-[13.5px] text-slate-700">{formatPhDay(logDateKey(missed), { weekday: "long", month: "short", day: "numeric" })} has no time-out</span>
          </span>
          <Icon name="chevron-right" size={18} className="shrink-0 text-(--status-late-ink)" />
        </button>
      )}
      {appealable.slice(0, 1).map((log) => {
        const until = appealUntil(log);
        return (
          <Link key={log.id} to={`/daily-log?filter=fix`} className="needs-row">
            <Icon name="flag" className="shrink-0 text-(--status-late-ink)" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-(--status-late-ink)">
                {log.status === "Rejected" ? "A day was rejected" : log.photo_rejected_at ? "A time-in photo was rejected" : "Your times were corrected"}
              </span>
              <span className="block text-[13.5px] text-slate-700">
                {formatPhDay(logDateKey(log), { weekday: "short", month: "short", day: "numeric" })}
                {until ? ` · you can appeal until ${formatDate(until.toISOString())}` : ""}
              </span>
            </span>
            <Icon name="chevron-right" size={18} className="shrink-0 text-(--status-late-ink)" />
          </Link>
        );
      })}
      {overdueTasks > 0 && (
        <Link to="/task" className="needs-row">
          <Icon name="tasks" className="shrink-0 text-(--status-late-ink)" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-(--status-late-ink)">
              {overdueTasks === 1 ? "1 task is past due" : `${overdueTasks} tasks are past due`}
            </span>
            <span className="block text-[13.5px] text-slate-700">Submit your work as soon as you can</span>
          </span>
          <Icon name="chevron-right" size={18} className="shrink-0 text-(--status-late-ink)" />
        </Link>
      )}
    </div>
  );

  return (
    <StudentLayout title="Today" showPhotoRedo={false}>
      <div className="mb-3 flex items-baseline justify-between gap-3 text-[15px] text-slate-700">
        <p>
          {greetingFor(new Date())}, {firstName}.
        </p>
        <p className="tabular shrink-0 text-[14px] text-slate-600">{formatPhDay(phToday(), { weekday: "short", month: "short", day: "numeric" })}</p>
      </div>

      {(attendance.error || error) && (
        <div className="mb-4">
          <ErrorNotice
            message={attendance.error || error}
            onRetry={() => {
              void attendance.reload();
              void load();
            }}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-4">
          {timeCard}
          {needs}
          <HoursCard summary={summary} loading={loading} />
          {summary?.completedAt && (
            <p className="rounded-xl bg-(--status-success-bg) px-4 py-3 text-[14px] text-(--status-success-ink)">
              <span className="font-bold">Required hours completed on {formatDate(summary.completedAt)}.</span>{" "}
              <Link to="/student/completion" className="font-semibold underline underline-offset-2">
                See what else is left
              </Link>
            </p>
          )}
        </div>
        <div className="min-w-0 space-y-4">
          <Shortcuts openTasks={openTasks.length} overdueTasks={overdueTasks} checklist={checklist} />
          <UpNext tasks={openTasks} loading={loading} />
          {wide && <QrHandOff />}
        </div>
      </div>

      {closing && missed && <LateTimeOutDialog log={missed} attendance={attendance} onClose={() => setClosing(false)} />}
    </StudentLayout>
  );
}

/* ---------- OJT hours: a road with a pin and a flag ---------- */

function HoursCard({ summary, loading }: { summary: DashboardData | null; loading: boolean }) {
  const projection = [...useProjections("student").values()][0];
  if (loading || !summary) {
    return (
      <Card className="p-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-44" />
        <Skeleton className="mt-6 h-7 w-full" />
      </Card>
    );
  }
  const rendered = Number(summary.hoursRendered) || 0;
  const required = Number(summary.requiredHours) || 0;
  const left = Math.max(0, required - rendered);
  const finish = projection?.projected_finish && left > 0 ? `expected to finish ${formatDate(projection.projected_finish)}` : null;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="eyebrow text-(--role-ink)/80">OJT hours</h2>
        <InfoTip label="About OJT hours" text="Only verified days count. A pending day is added once your supervisor verifies it." />
      </div>
      <p className="mt-1.5">
        <span className="font-display tabular text-[30px] font-extrabold leading-none text-slate-900">{formatHours(rendered).replace(/ h$/, "")}</span>{" "}
        <span className="text-[14.5px] text-slate-700">
          of {formatHours(required)}
          {required > 0 && left > 0 ? ` · ${formatHours(left)} left` : required > 0 ? " · done" : ""}
          {finish ? ` · ${finish}` : ""}
        </span>
      </p>
      {projection?.at_risk && left > 0 && (
        <p className="mt-1 text-[13px] font-semibold text-(--status-late-ink)">At this pace you may finish after the term ends.</p>
      )}
      <HoursRoad done={rendered} required={required} label={`${formatHours(rendered)} of ${formatHours(required)} verified`} />
      <div className="tabular mt-1.5 flex justify-between text-[12px] text-slate-600">
        <span>0 h</span>
        <span>{formatHours(required)}</span>
      </div>
    </Card>
  );
}

/* ---------- Shortcuts, as hairline rows ---------- */

type ChecklistItem = { key: string; done: boolean; detail: string };

/**
 * Each shortcut with where it stands (system pass): an icon tile in a
 * status tone and one line, from the completion checklist and the tasks.
 * The tone always comes with its words.
 */
function Shortcuts({ openTasks, overdueTasks, checklist }: { openTasks: number; overdueTasks: number; checklist: ChecklistItem[] }) {
  const line = (key: string) => checklist.find((item) => item.key === key);
  const documents = line("documents");
  const hours = line("hours");
  const rows: Array<{ label: string; to: string; icon: IconName; tone: Tone; detail?: string }> = [
    {
      label: "Tasks",
      to: "/task",
      icon: "tasks",
      tone: overdueTasks > 0 ? "danger" : openTasks > 0 ? "warning" : "success",
      detail: overdueTasks > 0 ? `${overdueTasks} past due · ${openTasks} open` : openTasks > 0 ? `${openTasks} open` : "Nothing open",
    },
    {
      label: "Documents",
      to: "/documents",
      icon: "document",
      tone: documents ? (documents.done ? "success" : "warning") : "brand",
      detail: documents?.detail,
    },
    { label: "Weekly report", to: "/journal", icon: "note", tone: "brand", detail: "One for each week you work" },
    { label: "Time record", to: "/time-record", icon: "printer", tone: "brand", detail: hours?.detail },
  ];
  return (
    <Card>
      <ul className="divide-y divide-(--role-hairline)">
        {rows.map((row) => (
          <li key={row.to}>
            <Link to={row.to} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-psu-50/50">
              <IconTile icon={row.icon} tone={row.tone} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-slate-900">{row.label}</span>
                {row.detail && <span className="block truncate text-[13px] text-slate-600">{row.detail}</span>}
              </span>
              <Icon name="chevron-right" size={16} className="shrink-0 text-slate-400" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- Up next ---------- */

function UpNext({ tasks, loading }: { tasks: Task[]; loading: boolean }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <h2 className="text-[16px] font-bold text-slate-900">Up next</h2>
        <Link to="/task" className="inline-flex min-h-11 items-center text-sm font-bold text-psu-700 hover:underline">
          See all
        </Link>
      </div>
      {loading ? (
        <SkeletonRows rows={2} />
      ) : tasks.length === 0 ? (
        <p className="px-4 pb-4 text-[14px] text-slate-600">No open tasks.</p>
      ) : (
        <ul className="divide-y divide-(--role-hairline) border-t border-(--role-hairline)">
          {tasks.slice(0, 3).map((task) => {
            const days = daysUntil(task.due_date);
            const late = days !== null && days < 0;
            return (
              <li key={task.id}>
                <Link to="/task" className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 hover:bg-psu-50/50">
                  <span className="min-w-0 truncate text-[15px] text-slate-900">{task.title}</span>
                  <span className={`shrink-0 text-[13px] font-semibold ${late ? "text-(--status-late-ink)" : "text-slate-600"}`}>{dueLabel(task.due_date)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
