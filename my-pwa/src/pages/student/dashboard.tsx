import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon, { type IconName } from "../../components/Icon";
import InfoTip from "../../components/InfoTip";
import type { Tone } from "../../components/tones";
import { Card, ErrorNotice, IconTile, Skeleton } from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import { daysUntil, formatDate, formatHours, greetingFor, firstNameOf } from "../../lib/format";
import { useHolidays } from "../../lib/useHolidays";
import { useLaunchReady } from "../../lib/launch";
import { savedFetch } from "../../lib/offlineStore";
import { formatPhDay, phToday } from "../../lib/phTime";
import { useAccount } from "../../lib/session";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { useProjections } from "../../lib/useProjections";
import { LateTimeOutDialog } from "./AttendanceCorrections";
import AttentionCard from "./AttentionCard";
import { attentionItems, useHiddenAttention } from "./attention";
import { PhotoRedoDialog } from "./PhotoRedo";
import TimeInProvider from "./TimeInProvider";
import TodayCard from "./TodayCard";
import UpNextCarousel, { type UpNextItem } from "./UpNextCarousel";
import { useTimeIn } from "./timeInContext";
import { useDeliverables } from "./useDeliverables";

/*
|--------------------------------------------------------------------------
| TODAY (PSU redesign, 7A; revisions November 2026)
|--------------------------------------------------------------------------
|
| The greeting and the date are on the folder's label tab. Then:
|
|   left    the time card (TodayCard.tsx); "Needs your attention", one card
|           with every item to act on, each hideable for the session
|           (AttentionCard.tsx, attention.ts)
|   right   Up next, cards to swipe through (UpNextCarousel.tsx); OJT hours
|           as one compact strip; the shortcuts to Tasks, Documents,
|           Reports and the Time record
|
| On a phone the same order, one column. "Time in from your phone" moved to
| the header's Scan button.
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

type Journal = { id: number; week_start: string; status: string; review_notes?: string | null };

const OPEN_TASK_STATUSES = ["Pending", "In Progress"];

/** Mounts the shared time-in actions above the page, which reads the attendance before it renders the layout. */
export default function Dashboard() {
  return (
    <TimeInProvider>
      <DashboardPage />
    </TimeInProvider>
  );
}

/** The Friday of the week a day is in, as YYYY-MM-DD. */
function fridayOf(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  const back = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - back + 4);
  return date.toISOString().slice(0, 10);
}

function DashboardPage() {
  const student = useAccount("student");
  const studentId = student?.student_id;
  const { attendance } = useTimeIn();
  const wide = useMediaQuery("(min-width: 1024px)");
  const holidays = useHolidays("student");
  const { deliverables, weekly } = useDeliverables(studentId);
  const projection = [...useProjections("student").values()][0];

  const [summary, setSummary] = useState<DashboardData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [journals, setJournals] = useState<{ list: Journal[]; week: string | null }>({ list: [], week: null });
  // The completion checklist's lines (documents, hours…), for the shortcuts' status.
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [running, setRunning] = useState<"missed-time-out" | "retake-photo" | null>(null);
  const attentionState = useHiddenAttention(studentId);
  useLaunchReady(!loading);

  const load = useCallback(async () => {
    if (!studentId) return;
    const id = encodeURIComponent(studentId);
    try {
      const [summaryResponse, tasksResponse, checklistResponse, journalsResponse] = await Promise.all([
        savedFetch("student", "dashboard", `${API_URL}/api/dashboard/${id}`, withStudentAuth()),
        savedFetch("student", "tasks", `${API_URL}/api/tasks/student/${id}`, withStudentAuth()),
        // Extras to Today: without them the shortcuts and reminders simply show less.
        savedFetch("student", "completion", `${API_URL}/api/students/${id}/completion`, withStudentAuth()).catch(() => null),
        savedFetch("student", "journals", `${API_URL}/api/journals/student/${id}`, withStudentAuth()).catch(() => null),
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
      if (journalsResponse?.ok) {
        const data = await journalsResponse.json().catch(() => ({}));
        setJournals({ list: Array.isArray(data.journals) ? data.journals : [], week: typeof data.current_week_start === "string" ? data.current_week_start : null });
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

  const attention = useMemo(
    () =>
      attentionItems({
        todayLog: attendance.todayLog,
        openPastLog: attendance.openPastLog,
        logs: attendance.logs,
        tasks,
        journals: journals.list,
        deliverables,
        weekly,
      }),
    [attendance.todayLog, attendance.openPastLog, attendance.logs, tasks, journals.list, deliverables, weekly]
  );

  const upNext = useMemo<UpNextItem[]>(() => {
    const today = phToday();
    const items: UpNextItem[] = [];
    for (const task of openTasks) {
      const days = daysUntil(task.due_date);
      if (!task.due_date || days === null || days < 1 || days > 45) continue;
      items.push({ key: `task:${task.id}`, kind: "task", date: task.due_date.slice(0, 10), title: task.title, detail: task.assigned_by ? `From ${task.assigned_by}` : undefined, to: "/task", action: "Open task" });
    }
    for (const item of [...deliverables.map((d) => ({ ...d, key: `once:${d.requirement_id}` })), ...weekly.map((w) => ({ ...w, key: `week:${w.item_id}` }))]) {
      const days = daysUntil(item.due_date);
      if (item.status !== "Not submitted" || days === null || days < 0 || days > 45) continue;
      items.push({ key: item.key, kind: "document", date: item.due_date.slice(0, 10), title: item.name, detail: `Reviewed by your ${item.reviewer_role}`, to: "/documents", action: "Upload" });
    }
    // This week's weekly report, when it has not been sent yet.
    const week = journals.week;
    if (week && !journals.list.some((journal) => journal.week_start === week)) {
      const friday = fridayOf(today);
      items.push({ key: `report:${week}`, kind: "report", date: friday < today ? today : friday, title: "This week's weekly report", detail: "Write it from your daily reports", to: "/journal?view=weekly", action: "Write report" });
    }
    for (const holiday of holidays) {
      const days = daysUntil(holiday.date);
      if (days === null || days < 0 || days > 30) continue;
      items.push({ key: `holiday:${holiday.id}`, kind: "holiday", date: holiday.date.slice(0, 10), title: holiday.name, detail: "Holiday: no OJT that day", to: "/schedule?view=month", action: "See the month" });
    }
    if (projection?.projected_finish && summary && Number(summary.hoursRendered) < Number(summary.requiredHours)) {
      items.push({ key: "finish", kind: "finish", date: projection.projected_finish, title: "Your required hours are done", detail: "If you keep to your schedule", to: "/schedule?view=progress", action: "See my progress" });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }, [openTasks, deliverables, weekly, journals, holidays, projection, summary]);

  const firstName = firstNameOf(student?.name, "there");
  const missed = attendance.openPastLog;
  const todayLog = attendance.todayLog;

  return (
    <StudentLayout
      title="Today"
      showPhotoRedo={false}
      folderLabel={{
        icon: "home",
        title: `${greetingFor(new Date())}, ${firstName}.`,
        line: formatPhDay(phToday(), { weekday: "long", month: "long", day: "numeric" }),
      }}
    >
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
          <TodayCard large={wide} />
          <AttentionCard
            items={loading ? [] : attention}
            hidden={attentionState.hidden}
            noAsk={attentionState.noAsk}
            onHide={attentionState.hide}
            onShowAll={attentionState.showAll}
            onNoAsk={attentionState.setNoAsk}
            onRun={setRunning}
          />
        </div>
        <div className="min-w-0 space-y-4">
          <UpNextCarousel items={upNext} loading={loading} />
          <HoursStrip summary={summary} loading={loading} finish={projection?.projected_finish ?? null} atRisk={Boolean(projection?.at_risk)} />
          <Shortcuts openTasks={openTasks.length} overdueTasks={overdueTasks} checklist={checklist} />
        </div>
      </div>

      {running === "missed-time-out" && missed && <LateTimeOutDialog log={missed} attendance={attendance} onClose={() => setRunning(null)} />}
      {running === "retake-photo" && todayLog && <PhotoRedoDialog logId={todayLog.id} onClose={() => setRunning(null)} />}
    </StudentLayout>
  );
}

/* ---------- OJT hours, as one compact strip ---------- */

function HoursStrip({ summary, loading, finish, atRisk }: { summary: DashboardData | null; loading: boolean; finish: string | null; atRisk: boolean }) {
  if (loading || !summary) {
    return (
      <Card className="p-3.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2.5 h-2 w-full" />
      </Card>
    );
  }
  const rendered = Number(summary.hoursRendered) || 0;
  const required = Number(summary.requiredHours) || 0;
  const left = Math.max(0, required - rendered);
  const share = required > 0 ? Math.min(1, rendered / required) : 0;
  const percent = Math.round(share * 100);
  return (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold-200 text-psu-900">
          <Icon name="hourglass" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="eyebrow text-(--role-ink)/80">OJT hours</h2>
            <span className="tabular text-[12.5px] font-bold text-slate-700">{percent}%</span>
          </div>
          <p className="tabular truncate text-[14px] text-slate-700">
            <span className="font-display text-[19px] font-extrabold text-slate-900">{formatHours(rendered).replace(/ h$/, "")}</span> of {formatHours(required)}
            {required > 0 && left > 0 ? ` · ${formatHours(left)} left` : required > 0 ? " · done" : ""}
          </p>
        </div>
        <InfoTip label="About OJT hours" text="Only verified days count. A pending day is added once your supervisor verifies it, or by itself two working days after a clean day." />
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-psu-100"
        role="progressbar"
        aria-label="Verified OJT hours"
        aria-valuemin={0}
        aria-valuemax={required || 100}
        aria-valuenow={Math.min(rendered, required || rendered)}
        aria-valuetext={`${formatHours(rendered)} of ${formatHours(required)} verified`}
      >
        <div className="h-full rounded-full bg-linear-to-r from-gold-400 to-psu-600" style={{ width: `${percent}%` }} />
      </div>
      {(summary.completedAt || (finish && left > 0)) && (
        <p className={`mt-1.5 text-[12.5px] ${atRisk && left > 0 ? "font-semibold text-(--status-late-ink)" : "text-slate-600"}`}>
          {summary.completedAt ? (
            <>
              Completed {formatDate(summary.completedAt)}.{" "}
              <Link to="/student/completion" className="font-bold text-psu-700 hover:underline">
                See what else is left
              </Link>
            </>
          ) : atRisk ? (
            `At this pace you may finish after the term ends (expected ${formatDate(finish)}).`
          ) : (
            `Expected to finish ${formatDate(finish)}`
          )}
        </p>
      )}
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
    { label: "Reports", to: "/journal", icon: "note", tone: "brand", detail: "Daily, weekly and monthly" },
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
