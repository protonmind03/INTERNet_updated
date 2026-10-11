import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ColumnChart, ShareBar } from "../../components/charts";
import Icon, { type IconName } from "../../components/Icon";
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  Skeleton,
  SkeletonRows,
} from "../../components/ui";
import { BrandLoader } from "../../brand";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { formatDate, formatHours, formatLongDate, greetingFor } from "../../lib/format";
import { useLaunchReady } from "../../lib/launch";
import { errorText } from "../../lib/toast";
import KpiCards from "./KpiCards";
import { coordinatorRequest } from "./request";
import FilterBar from "./FilterBar";
import { useStudentFilters } from "./useStudentFilters";

/*
|--------------------------------------------------------------------------
| COORDINATOR DASHBOARD
|--------------------------------------------------------------------------
|
| Top to bottom, in the order a coordinator asks: who is in today; what
| needs someone to act, and who; whether the programme is on target; and
| then the detail (hours, progress, what waits with each supervisor).
|
| Everything is counted on the server. The page asks for three summaries
| and never downloads the students themselves.
|
*/

type DashboardData = {
  students: { active: number; total: number };
  today: { timedIn: number; onTheClock: number; absent: number };
  hoursTrend: { day: string; hours: number; logs: number }[];
};

type ActionRow = {
  key: string;
  count: number;
  label: string;
  reason: string;
  link: string;
  names?: string[];
};

type ActionGroup = { who: "you" | "supervisors" | "students"; title: string; rows: ActionRow[] };

type Actions = {
  groups: ActionGroup[];
  scheduled_not_in: number;
  progress: { students: number; not_started: number; under_half: number; past_half: number; completed: number };
  supervisor_queues: { supervisor_id: string; name: string; interns: number; logs: number; tasks: number; waiting: number }[];
};

const GROUPS: Record<ActionGroup["who"], { icon: IconName; note: string }> = {
  you: { icon: "user", note: "Only you can settle these." },
  supervisors: { icon: "briefcase", note: "Waiting on supervisors. Follow up if they stay." },
  students: { icon: "users", note: "Students to check on." },
};

// Lighter to darker along the same blue: further along is darker.
const PROGRESS_BANDS = [
  { key: "not_started", label: "Not started", color: "#95a9fc" },
  { key: "under_half", label: "Under halfway", color: "#637bf4" },
  { key: "past_half", label: "Past halfway", color: "#1d36d3" },
  { key: "completed", label: "Completed", color: "#0f1e6e" },
] as const;

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** "Oct 6" for a "YYYY-MM-DD" day. */
const dayLabel = (day: string) => formatDate(day).replace(/, \d{4}$/, "");

export default function CoordinatorDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [actions, setActions] = useState<Actions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useLaunchReady(!loading);
  // Shared with the other coordinator pages, so the choice carries between them.
  const studentFilters = useStudentFilters();
  const termQuery = studentFilters.query ? `?${studentFilters.query}` : "";

  const load = useCallback(async () => {
    try {
      const [summary, list] = await Promise.all([
        coordinatorRequest<DashboardData>(`/api/coordinator/dashboard${termQuery}`),
        coordinatorRequest<Actions>(`/api/coordinator/actions${termQuery}`),
      ]);
      setData(summary);
      setActions(list);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the dashboard."));
    } finally {
      setLoading(false);
    }
  }, [termQuery]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    // Several notifications often arrive together; reload once for the burst.
    let timer = 0;
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 400);
    };
    window.addEventListener("internet-notification", later);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("internet-notification", later);
    };
  }, [load]);

  const groups = actions ? actions.groups.filter((group) => group.rows.length > 0) : [];
  const trendHours = data ? data.hoursTrend.reduce((sum, day) => sum + day.hours, 0) : 0;
  const queues = actions?.supervisor_queues ?? [];

  return (
    <CoordinatorLayout
      title="Dashboard"
      subtitle={`${greetingFor(new Date())}. Here is where the programme stands on ${formatLongDate(new Date())}.`}
    >
      <div className="space-y-6">
        <FilterBar state={studentFilters} />
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        {/* TODAY */}
        <section aria-labelledby="today-heading">
          <h2 id="today-heading" className="mb-3 text-sm font-semibold text-slate-900">
            Today's attendance
          </h2>
          {loading ? (
            <BrandLoader role="coordinator" process="dashboard" />
          ) : !data || !actions ? (
            <Skeleton className="h-20 rounded-xl" />
          ) : (
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <TodayFigure
                label="Timed in"
                value={`${data.today.timedIn} of ${data.students.active}`}
                note="Active students with a log today"
              />
              <TodayFigure
                label="On the clock now"
                value={data.today.onTheClock}
                note="Timed in and not yet out"
              />
              <TodayFigure label="Absent" value={data.today.absent} note="Filed an absence for today" />
              <TodayFigure
                label="Scheduled, not yet in"
                value={actions.scheduled_not_in}
                note="Due today with no log and no absence"
              />
            </dl>
          )}
        </section>

        {/* WHAT NEEDS DOING, AND WHO DOES IT */}
        <Card>
          <CardHeader
            title="Action list"
            description="What needs someone to act, grouped by who"
          />
          <div className="mt-3">
            {loading ? (
              <SkeletonRows rows={4} />
            ) : groups.length === 0 ? (
              <EmptyState
                icon="check-circle"
                title="Nothing needs doing"
                description="No open concerns, flagged logs, waiting reviews or students to check on."
              />
            ) : (
              <div className="grid grid-cols-1 border-t border-slate-100 lg:grid-cols-3 lg:divide-x lg:divide-slate-100">
                {(["you", "supervisors", "students"] as const).map((who) => {
                  const group = actions?.groups.find((item) => item.who === who);
                  const rows = group?.rows ?? [];
                  return (
                    <section
                      key={who}
                      aria-labelledby={`actions-${who}`}
                      className="border-b border-slate-100 last:border-b-0 lg:border-b-0"
                    >
                      <div className="flex items-center gap-2.5 px-4 pt-4 sm:px-5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-psu-50 text-psu-700 ring-1 ring-inset ring-psu-600/10">
                          <Icon name={GROUPS[who].icon} size={16} />
                        </span>
                        <div className="min-w-0">
                          <h3 id={`actions-${who}`} className="text-sm font-semibold text-slate-900">
                            {group?.title ?? who}
                          </h3>
                          <p className="text-xs text-slate-600">{GROUPS[who].note}</p>
                        </div>
                      </div>
                      {rows.length === 0 ? (
                        <p className="px-4 pb-5 pt-3 text-sm text-slate-600 sm:px-5">Nothing here.</p>
                      ) : (
                        <ul className="mt-2 divide-y divide-slate-100">
                          {rows.map((row) => (
                            <li key={row.key}>
                              <Link
                                to={row.link}
                                className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5"
                              >
                                <span className="tabular mt-0.5 flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-slate-900 px-1.5 text-sm font-semibold text-white">
                                  {row.count}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold text-slate-900">
                                    {row.label}
                                  </span>
                                  <span className="block text-sm text-slate-600">{row.reason}</span>
                                  {row.names && row.names.length > 0 && (
                                    <span className="mt-0.5 block truncate text-xs text-slate-600">
                                      {row.names.join(", ")}
                                      {row.count > row.names.length && ` and ${row.count - row.names.length} more`}
                                    </span>
                                  )}
                                </span>
                                <Icon name="chevron-right" size={16} className="mt-1 shrink-0 text-slate-400" />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* IS IT GOING WELL */}
        <KpiCards query={studentFilters.query} />

        {/* THE DETAIL */}
        <Card className="min-w-0">
          <CardHeader
            title="Verified hours, last 14 days"
            description={loading ? undefined : `${formatHours(trendHours)} in total`}
            action={<CardLink to="/coordinator/analytics" label="Analytics" />}
          />
          <div className="px-4 pb-4 pt-7 sm:px-5">
            {loading || !data ? (
              <Skeleton className="h-36 w-full" />
            ) : trendHours === 0 ? (
              <p className="py-10 text-center text-sm text-slate-600">
                No hours were verified in the last 14 days.
              </p>
            ) : (
              <ColumnChart
                points={data.hoursTrend.map((day) => ({
                  key: day.day,
                  label: dayLabel(day.day),
                  value: day.hours,
                  detail: day.logs === 0 ? "No attendance logged" : plural(day.logs, "log"),
                }))}
                label="Verified hours per day over the last 14 days"
                format={(value) => formatHours(value)}
                height={130}
                axis={false}
              />
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader
              title="Progress toward required hours"
              description={
                loading || !actions ? undefined : plural(actions.progress.students, "active student")
              }
              action={<CardLink to="/coordinator/monitoring" label="Monitoring" />}
            />
            <div className="px-4 pb-5 pt-5 sm:px-5">
              {loading || !actions ? (
                <Skeleton className="h-28 w-full" />
              ) : actions.progress.students === 0 ? (
                <p className="py-6 text-center text-sm text-slate-600">No active students yet.</p>
              ) : (
                <ShareBar
                  label="Active students by progress toward their required hours"
                  segments={PROGRESS_BANDS.map((band) => ({
                    label: band.label,
                    color: band.color,
                    value: actions.progress[band.key],
                  }))}
                />
              )}
            </div>
          </Card>

          <Card className="min-w-0">
            <CardHeader
              title="Waiting with supervisors"
              description="Attendance logs and task submissions not yet reviewed"
              action={<CardLink to="/coordinator/supervisors" label="Supervisors" />}
            />
            <div className="mt-3">
              {loading ? (
                <SkeletonRows rows={3} />
              ) : queues.length === 0 ? (
                <EmptyState icon="briefcase" title="No supervisors have interns yet" />
              ) : queues.every((queue) => queue.waiting === 0) ? (
                <EmptyState
                  icon="check-circle"
                  title="Supervisors are caught up"
                  description="No logs or submissions are waiting for review."
                />
              ) : (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {queues.slice(0, 5).map((queue) => (
                    <li
                      key={queue.supervisor_id}
                      className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{queue.name}</p>
                        <p className="text-xs text-slate-600">
                          {plural(queue.interns, "intern")} · {plural(queue.logs, "log")} ·{" "}
                          {plural(queue.tasks, "task")}
                        </p>
                      </div>
                      <span
                        className={`tabular shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                          queue.waiting > 0
                            ? "bg-amber-50 text-amber-800 ring-amber-600/25"
                            : "bg-slate-100 text-slate-600 ring-slate-500/15"
                        }`}
                      >
                        {queue.waiting} waiting
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </CoordinatorLayout>
  );
}

/** One of today's four counts. Plain: these are facts, not judged against a target. */
function TodayFigure({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
      <dt className="text-xs font-medium text-slate-600">{label}</dt>
      <dd className="tabular mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</dd>
      <dd className="mt-0.5 text-xs text-slate-600">{note}</dd>
    </div>
  );
}

function CardLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm font-semibold text-psu-700 hover:underline"
    >
      {label}
      <Icon name="chevron-right" size={14} />
    </Link>
  );
}
