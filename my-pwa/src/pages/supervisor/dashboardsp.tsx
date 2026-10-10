import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon, { type IconName } from "../../components/Icon";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  FilterChips,
  Modal,
  ProgressBar,
  StatTile,
} from "../../components/ui";
import { BrandLoader } from "../../brand";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import {
  daysUntil,
  formatDate,
  formatDayDate,
  formatHours,
  greetingFor,
  localDateKey,
} from "../../lib/format";
import { useLaunchReady } from "../../lib/launch";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import RecordTimeIn from "./RecordTimeIn";
import ReviewDetail from "./ReviewDetail";
import { useSupervisorWork, type QueueItem } from "./useSupervisorWork";

type Filter = "all" | QueueItem["kind"];

const KIND_ICON: Record<QueueItem["kind"], IconName> = {
  attendance: "clock",
  task: "tasks",
  document: "document",
  absence: "calendar",
};

/** How long an item has been waiting, in plain words. */
function waitingText(since: string): string {
  const then = new Date(since).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 60) return minutes <= 1 ? "Just now" : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function titleOf(item: QueueItem): string {
  if (item.kind === "attendance") return `Attendance · ${formatDayDate(item.entry.date)}`;
  if (item.kind === "task") return item.entry.title;
  if (item.kind === "absence") return `Absence · ${formatDayDate(item.entry.date)}`;
  return item.entry.doc_type;
}

function summaryOf(item: QueueItem): string {
  if (item.kind === "attendance") {
    return item.entry.time_out
      ? `${formatHours(item.entry.hours)} logged`
      : "Still on the clock";
  }
  if (item.kind === "task") return "Task submitted";
  if (item.kind === "absence") return "Absence filed";
  return "Document uploaded";
}

/** True on screens wide enough for the list and the detail side by side. */
function useIsWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

export default function SupervisorDashboard() {
  const supervisor = useAccount("supervisor");
  const work = useSupervisorWork(supervisor?.supervisor_id);
  useLaunchReady(!work.loading);
  const { queue, interns, loading } = work;
  const wide = useIsWide();

  const [filter, setFilter] = useState<Filter>("all");
  const [internId, setInternId] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [recording, setRecording] = useState(false);

  // The figures for the summary row, all from lists already loaded.
  const summary = useMemo(() => {
    const now = new Date();
    const today = localDateKey(now);
    // Monday of this week.
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const weekStart = localDateKey(monday);
    const open = work.tasks.filter(
      (task) => task.status === "Pending" || task.status === "In Progress"
    );
    return {
      onTheClock: work.attendance.filter((entry) => entry.date === today && !entry.time_out)
        .length,
      weekHours: work.attendance
        .filter((entry) => entry.status === "Verified" && entry.date >= weekStart)
        .reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0),
      openTasks: open.length,
      overdueTasks: open.filter((task) => (daysUntil(task.due_date) ?? 0) < 0).length,
    };
  }, [work.attendance, work.tasks]);

  // The queue narrowed to one intern, when one is chosen.
  const scoped = useMemo(
    () => (internId ? queue.filter((item) => item.entry.student_id === internId) : queue),
    [queue, internId]
  );

  const counts = useMemo(
    () => ({
      all: scoped.length,
      attendance: scoped.filter((item) => item.kind === "attendance").length,
      task: scoped.filter((item) => item.kind === "task").length,
      document: scoped.filter((item) => item.kind === "document").length,
      absence: scoped.filter((item) => item.kind === "absence").length,
    }),
    [scoped]
  );

  const visible = useMemo(
    () => (filter === "all" ? scoped : scoped.filter((item) => item.kind === filter)),
    [scoped, filter]
  );

  // On a wide screen something is always open; on a phone only what was tapped.
  const selected =
    visible.find((item) => item.key === selectedKey) ?? (wide ? visible[0] : undefined);

  // Attendance logs that are complete and can be verified in one go.
  const verifiable = useMemo(
    () =>
      scoped.filter(
        (item): item is Extract<QueueItem, { kind: "attendance" }> =>
          item.kind === "attendance" && Boolean(item.entry.time_out)
      ),
    [scoped]
  );

  const moveOn = () => {
    // The reviewed item leaves the queue on reload; open the one after it.
    const index = visible.findIndex((item) => item.key === selected?.key);
    const next = visible[index + 1] ?? visible[index - 1];
    setSelectedKey(wide && next ? next.key : null);
  };

  // Arrow keys (or J and K) step through the queue on wide screens, so a
  // supervisor can clear it without reaching for the mouse each time.
  useEffect(() => {
    if (!wide) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      const step =
        event.key === "ArrowDown" || event.key === "j"
          ? 1
          : event.key === "ArrowUp" || event.key === "k"
            ? -1
            : 0;
      if (step === 0 || visible.length === 0) return;
      event.preventDefault();
      const index = visible.findIndex((item) => item.key === selected?.key);
      const next = visible[Math.max(0, Math.min(visible.length - 1, index + step))];
      if (next) setSelectedKey(next.key);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [wide, visible, selected?.key]);

  const verifyAll = async () => {
    setBulkBusy(true);
    try {
      const { done, failure } = await work.verifyMany(verifiable.map((item) => item.entry.id));
      if (failure) {
        toast.error(`${done} verified, then it stopped: ${failure}`);
      } else {
        toast.success(`${done} attendance ${done === 1 ? "log" : "logs"} verified.`);
      }
    } catch (error) {
      toast.error(errorText(error, "The logs could not be verified."));
    } finally {
      setBulkBusy(false);
      setConfirmBulk(false);
      setSelectedKey(null);
    }
  };

  const firstName = (supervisor?.name || "").trim().split(/\s+/)[0] || "";

  return (
    <SupervisorLayout
      title="Review"
      subtitle={
        loading
          ? `${greetingFor(new Date())}${firstName ? `, ${firstName}` : ""}.`
          : queue.length === 0
            ? `${greetingFor(new Date())}${firstName ? `, ${firstName}` : ""}. Nothing is waiting on you.`
            : `${greetingFor(new Date())}${firstName ? `, ${firstName}` : ""}. ${queue.length} ${
                queue.length === 1 ? "item needs" : "items need"
              } your decision.`
      }
      actions={
        <>
          {verifiable.length > 1 && (
            <Button variant="secondary" icon="check-circle" onClick={() => setConfirmBulk(true)}>
              Verify {verifiable.length} completed logs
            </Button>
          )}
          {interns.length > 0 && (
            <Button variant="secondary" icon="camera" onClick={() => setRecording(true)}>
              Record time-in
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {work.error && <ErrorNotice message={work.error} onRetry={() => void work.reload()} />}

        {/* Where things stand, so the page says something even with an empty queue. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Waiting on you"
            value={loading ? "–" : queue.length}
            hint={queue.length === 0 ? "Nothing to review" : "Across all your interns"}
            icon="clipboard"
            tone={!loading && queue.length > 0 ? "waiting" : "neutral"}
          />
          <StatTile
            label="Interns"
            value={loading ? "–" : interns.length}
            hint={
              loading
                ? undefined
                : `${summary.onTheClock} on the clock today`
            }
            icon="users"
          />
          <StatTile
            label="Hours verified this week"
            value={loading ? "–" : formatHours(summary.weekHours)}
            hint="Since Monday"
            icon="clock"
            tone="gold"
          />
          <StatTile
            label="Tasks with interns"
            value={loading ? "–" : summary.openTasks}
            hint={
              loading
                ? undefined
                : summary.overdueTasks > 0
                  ? `${summary.overdueTasks} past due`
                  : "None past due"
            }
            icon="tasks"
            tone={!loading && summary.overdueTasks > 0 ? "bad" : "brand"}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <FilterChips
              label="Filter the queue"
              value={filter}
              onChange={(next) => {
                setFilter(next);
                setSelectedKey(null);
              }}
              options={[
                { value: "all", label: "Everything", count: counts.all },
                { value: "attendance", label: "Attendance", count: counts.attendance },
                { value: "task", label: "Tasks", count: counts.task },
                { value: "document", label: "Documents", count: counts.document },
                { value: "absence", label: "Absences", count: counts.absence },
              ]}
            />
          </div>
          {interns.length > 1 && (
            <label className="block w-full sm:w-56">
              <span className="sr-only">Intern</span>
              <select
                value={internId}
                onChange={(event) => {
                  setInternId(event.target.value);
                  setSelectedKey(null);
                }}
                className="field"
              >
                <option value="">All interns</option>
                {interns.map((intern) => (
                  <option key={intern.student_id} value={intern.student_id}>
                    {intern.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
          {/* QUEUE */}
          <Card className="overflow-hidden">
            {loading ? (
              <BrandLoader role="supervisor" process="dashboard" />
            ) : visible.length === 0 ? (
              <EmptyState
                icon="check-circle"
                title={queue.length === 0 ? "You're all caught up" : "Nothing of this kind"}
                description={
                  queue.length === 0
                    ? "New attendance logs, task submissions, documents and absences will appear here."
                    : "Change the filters to see the rest of the queue."
                }
              />
            ) : (
              <ul className="max-h-[max(20rem,calc(100dvh-24rem))] divide-y divide-slate-100 overflow-y-auto">
                {visible.map((item) => {
                  const active = wide && item.key === selected?.key;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(item.key)}
                        aria-current={active ? "true" : undefined}
                        className={`relative flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                          active
                            ? "bg-linear-to-r from-psu-100/80 to-psu-50/60"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        {active && (
                          <span className="absolute inset-y-0 left-0 w-[3px] bg-psu-600" />
                        )}
                        <span
                          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                            active ? "bg-psu-100 text-psu-700" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <Icon name={KIND_ICON[item.kind]} size={17} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {item.entry.student_name}
                          </span>
                          <span className="block truncate text-sm text-slate-700">
                            {titleOf(item)}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {summaryOf(item)} · {waitingText(item.waitingSince)}
                          </span>
                        </span>
                        <Icon
                          name="chevron-right"
                          size={16}
                          className="mt-2.5 shrink-0 text-slate-300 lg:hidden"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {wide && visible.length > 0 && (
              <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                <kbd className="rounded border border-slate-200 bg-slate-50 px-1">↑</kbd>{" "}
                <kbd className="rounded border border-slate-200 bg-slate-50 px-1">↓</kbd> to move
                through the queue,{" "}
                <kbd className="rounded border border-slate-200 bg-slate-50 px-1">A</kbd> to
                approve.
              </p>
            )}
          </Card>

          {/* DETAIL (wide screens) */}
          <div className="hidden lg:block">
            {selected ? (
              <Card key={selected.key} className="animate-page-in p-6">
                <ReviewDetail item={selected} work={work} onDecided={moveOn} shortcuts />
              </Card>
            ) : (
              !loading && <InternOverview work={work} />
            )}
          </div>
        </div>

        {/* When the queue is empty on a phone, show the interns instead of a blank page. */}
        {!loading && queue.length === 0 && (
          <div className="lg:hidden">
            <InternOverview work={work} />
          </div>
        )}

        {!loading && interns.length === 0 && !work.error && (
          <p className="text-sm text-slate-600">
            No interns are assigned to you yet. Your OJT coordinator assigns interns to
            supervisors.
          </p>
        )}
      </div>

      {/* DETAIL (phones): a sheet over the list */}
      <Modal
        open={!wide && Boolean(selected)}
        onClose={() => setSelectedKey(null)}
        title={selected ? selected.entry.student_name : ""}
        size="lg"
      >
        {selected && <ReviewDetail item={selected} work={work} onDecided={moveOn} />}
      </Modal>

      <RecordTimeIn open={recording} onClose={() => setRecording(false)} work={work} />

      <ConfirmDialog
        open={confirmBulk}
        title={`Verify ${verifiable.length} attendance logs?`}
        message="Every pending log that has a time-out will be marked verified. Logs you want to reject should be reviewed one by one first."
        confirmLabel="Verify all"
        busy={bulkBusy}
        busyProcess="verify"
        onConfirm={() => void verifyAll()}
        onCancel={() => setConfirmBulk(false)}
      >
        <ul className="max-h-48 space-y-1.5 overflow-y-auto text-sm text-slate-700">
          {verifiable.map((item) => (
            <li key={item.key} className="flex justify-between gap-3">
              <span className="truncate">{item.entry.student_name}</span>
              <span className="tabular shrink-0 text-slate-500">
                {formatDate(item.entry.date)} · {formatHours(item.entry.hours)}
              </span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </SupervisorLayout>
  );
}

/** Shown beside an empty queue: where each intern stands. */
function InternOverview({ work }: { work: ReturnType<typeof useSupervisorWork> }) {
  const { interns } = work;
  if (interns.length === 0) return null;
  return (
    <Card>
      <div className="flex items-center justify-between px-5 pt-4">
        <h2 className="text-sm font-semibold text-slate-900">Your interns</h2>
        <Link
          to="/supervisor/interns"
          className="inline-flex items-center gap-1 text-sm font-semibold text-psu-700 hover:underline"
        >
          See all
          <Icon name="chevron-right" size={14} />
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
        {interns.slice(0, 6).map((intern) => (
          <li key={intern.student_id} className="px-5 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium text-slate-900">{intern.name}</p>
              <p className="tabular shrink-0 text-sm text-slate-600">
                {formatHours(intern.hours_rendered)} of {formatHours(intern.required_hours)}
              </p>
            </div>
            <ProgressBar
              value={intern.completion}
              className="mt-2"
              label={`${intern.name}: ${intern.completion} percent of required hours`}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
