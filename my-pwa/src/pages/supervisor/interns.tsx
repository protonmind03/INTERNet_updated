import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../components/Icon";
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  Modal,
  ProgressBar,
  Skeleton,
  StatusBadge,
} from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import {
  dueLabel,
  formatDayDate,
  formatHours,
  formatTime,
  getInitials,
} from "../../lib/format";
import { useAccount } from "../../lib/session";
import { useSupervisorWork, type Intern, type SupervisorWork } from "./useSupervisorWork";

export default function SupervisorInterns() {
  const supervisor = useAccount("supervisor");
  const work = useSupervisorWork(supervisor?.supervisor_id);
  const { interns, loading } = work;

  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return interns;
    return interns.filter((intern) =>
      [intern.name, intern.student_id, intern.program, intern.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text))
    );
  }, [interns, search]);

  const opened = interns.find((intern) => intern.student_id === openId) ?? null;

  return (
    <SupervisorLayout
      title="Interns"
      subtitle={
        loading
          ? "The students assigned to you."
          : `${interns.length} ${interns.length === 1 ? "student is" : "students are"} assigned to you.`
      }
    >
      <div className="space-y-5">
        {work.error && <ErrorNotice message={work.error} onRetry={() => void work.reload()} />}

        {interns.length > 3 && (
          <label className="relative block max-w-sm">
            <span className="sr-only">Search interns</span>
            <Icon
              name="search"
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, ID or program"
              className="field pl-9"
            />
          </label>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((card) => (
              <Card key={card} className="space-y-3 p-5">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-2 w-full" />
              </Card>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon="users"
              title={interns.length === 0 ? "No interns yet" : "No interns match your search"}
              description={
                interns.length === 0
                  ? "Your OJT coordinator assigns students to you."
                  : undefined
              }
            />
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((intern) => {
              const pending = pendingFor(work, intern.student_id);
              return (
                <li key={intern.student_id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(intern.student_id)}
                    className="block h-full w-full rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-psu-300 hover:bg-psu-50/40"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-psu-700 text-sm font-bold text-white">
                        {getInitials(intern.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {intern.name}
                        </p>
                        <p className="truncate text-sm text-slate-500">
                          {intern.program || intern.student_id}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-baseline justify-between text-sm">
                      <span className="text-slate-600">Hours verified</span>
                      <span className="tabular font-medium text-slate-900">
                        {formatHours(intern.hours_rendered)} of{" "}
                        {formatHours(intern.required_hours)}
                      </span>
                    </div>
                    <ProgressBar
                      value={intern.completion}
                      className="mt-2"
                      label={`${intern.completion} percent of required hours`}
                    />

                    <p className="mt-4 text-sm text-slate-600">
                      {intern.active_tasks} open {intern.active_tasks === 1 ? "task" : "tasks"}
                      {pending > 0 && (
                        <span className="font-semibold text-amber-700">
                          {" "}
                          · {pending} waiting for you
                        </span>
                      )}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <InternDialog intern={opened} work={work} onClose={() => setOpenId(null)} />
    </SupervisorLayout>
  );
}

/** Items of this intern's that are waiting for the supervisor's decision. */
function pendingFor(work: SupervisorWork, studentId: string): number {
  return work.queue.filter((item) => item.entry.student_id === studentId).length;
}

function InternDialog({
  intern,
  work,
  onClose,
}: {
  intern: Intern | null;
  work: SupervisorWork;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  if (!intern) return null;

  const logs = work.attendance.filter((entry) => entry.student_id === intern.student_id);
  const tasks = work.tasks.filter((entry) => entry.student_id === intern.student_id);
  const documents = work.documents.filter((entry) => entry.student_id === intern.student_id);
  const pending = pendingFor(work, intern.student_id);

  return (
    <Modal
      open
      onClose={onClose}
      title={intern.name}
      description={[intern.student_id, intern.program].filter(Boolean).join(" · ")}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="secondary"
            icon="printer"
            onClick={() =>
              navigate(
                `/supervisor/time-record?student=${encodeURIComponent(intern.student_id)}`
              )
            }
          >
            Time record
          </Button>
          {pending > 0 && (
            <Button onClick={() => navigate("/supervisor/dashboard")}>
              Review {pending} waiting
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-700">Hours verified</span>
            <span className="tabular text-slate-900">
              {formatHours(intern.hours_rendered)} of {formatHours(intern.required_hours)} (
              {intern.completion}%)
            </span>
          </div>
          <ProgressBar value={intern.completion} className="mt-2" />
          <a
            href={`mailto:${intern.email}`}
            className="mt-3 inline-block text-sm font-semibold text-psu-700 hover:underline"
          >
            {intern.email}
          </a>
        </div>

        <InternSchedule key={intern.student_id} studentId={intern.student_id} />

        <Section title="Recent attendance" empty="No attendance logged yet." count={logs.length}>
          {logs.slice(0, 5).map((entry) => (
            <Line key={entry.id} status={entry.status}>
              <span className="font-medium text-slate-900">{formatDayDate(entry.date)}</span>
              <span className="tabular text-slate-500">
                {" "}
                · {formatTime(entry.time_in)} – {formatTime(entry.time_out)}
                {entry.hours !== null && ` · ${formatHours(entry.hours)}`}
              </span>
            </Line>
          ))}
        </Section>

        <Section title="Tasks" empty="No tasks assigned yet." count={tasks.length}>
          {tasks.slice(0, 6).map((entry) => (
            <Line key={entry.id} status={entry.status === "Pending" ? "To do" : entry.status}>
              <span className="font-medium text-slate-900">{entry.title}</span>
              {(entry.status === "Pending" || entry.status === "In Progress") && (
                <span className="text-slate-500"> · {dueLabel(entry.due_date)}</span>
              )}
            </Line>
          ))}
        </Section>

        <Section title="Documents" empty="No documents uploaded yet." count={documents.length}>
          {documents.slice(0, 8).map((entry) => (
            <Line key={entry.id} status={entry.status}>
              <span className="font-medium text-slate-900">{entry.doc_type}</span>
            </Line>
          ))}
        </Section>
      </div>
    </Modal>
  );
}

type ScheduleDay = {
  id: number;
  day: string;
  start_time: string | null;
  end_time: string | null;
  focus: string | null;
  hours: number | string | null;
};

/** "08:00:00" as "8:00 AM". */
function clockTime(value: string | null): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || "");
  if (!match) return "";
  const hour = Number(match[1]);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

/** The weekly OJT schedule the coordinator set for this intern. */
function InternSchedule({ studentId }: { studentId: string }) {
  const [days, setDays] = useState<ScheduleDay[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(
      `${API_URL}/api/supervisor/interns/${encodeURIComponent(studentId)}/schedule`,
      withSupervisorAuth()
    )
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error();
        if (active) setDays(Array.isArray(data.schedule) ? data.schedule : []);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [studentId]);

  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-900">Weekly schedule</h3>
      {failed ? (
        <p className="mt-2 text-sm text-red-700">The schedule could not be loaded.</p>
      ) : days === null ? (
        <Skeleton className="mt-2 h-10 w-full" />
      ) : days.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          The OJT coordinator has not set a schedule for this intern yet.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {days.map((day) => (
            <li
              key={day.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2.5 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium text-slate-900">{day.day}</span>
                {day.focus && <span className="text-slate-500"> · {day.focus}</span>}
              </span>
              <span className="tabular shrink-0 text-slate-600">
                {clockTime(day.start_time)} – {clockTime(day.end_time)}
                {day.hours !== null && ` · ${formatHours(day.hours)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Section({
  title,
  empty,
  count,
  children,
}: {
  title: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-900">
        {title} <span className="font-normal text-slate-400">({count})</span>
      </h3>
      {count === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {children}
        </ul>
      )}
    </section>
  );
}

function Line({ status, children }: { status: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
      <span className="min-w-0 truncate">{children}</span>
      <StatusBadge
        status={status}
        tone={status === "To do" ? "neutral" : undefined}
      />
    </li>
  );
}
