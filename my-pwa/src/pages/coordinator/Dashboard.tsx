import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PsuSeal } from "../../brand";
import { CollegeMark, ProgramMark } from "../../brand/MarkImages";
import { DeparturesRow, RouteLine, SplitFacts } from "../../brand/motifs";
import Icon from "../../components/Icon";
import InfoTip from "../../components/InfoTip";
import { Button, Card, ErrorNotice, Skeleton, SkeletonRows } from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { formatDayDate, formatHours, getInitials, greetingFor } from "../../lib/format";
import { useLaunchReady } from "../../lib/launch";
import { formatPhDay, phToday } from "../../lib/phTime";
import { useAccount } from "../../lib/session";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";
import FilterBar from "./FilterBar";
import { useStudentFilters } from "./useStudentFilters";

/*
|--------------------------------------------------------------------------
| THE COORDINATOR'S HOME (PSU redesign 11: C1 on phones, C6 and C7 wider)
|--------------------------------------------------------------------------
|
| In order: the cohort as a route on grid paper (the college's seal when a
| college is chosen, the program's organisation mark beside it, the PSU
| seal when nothing is chosen); "Needs you" as a departures board, the
| open appeals first with a solid red Decide, then each other row as a
| code, a title, its age and Open; then plain figures (a count, one line,
| an "i"), and This week. There are no targets, deltas or scores.
|
| Everything is counted on the server: GET /api/coordinator/home (the
| cohort, appeals, this week), /api/coordinator/actions (what needs
| someone) and /api/coordinator/dashboard (today), for the students the
| filters leave.
|
*/

type DashboardData = {
  students: { active: number; total: number };
  today: { timedIn: number; onTheClock: number; absent: number };
};

type ActionRow = {
  key: string;
  count: number;
  label: string;
  reason: string;
  link: string;
  names?: string[];
  people?: { id: string; name: string; detail: string; reminded_today: boolean }[];
};
type Actions = {
  groups: { who: "you" | "supervisors" | "students"; title: string; rows: ActionRow[] }[];
  scheduled_not_in: number;
  supervisor_queues: { supervisor_id: string; name: string; interns: number; logs: number; tasks: number; waiting: number }[];
};

type Home = {
  week: { number: number; of: number; term: string } | null;
  scope: {
    college: { id: number; name: string; short_name: string | null; mark_key: string | null } | null;
    program: { id: number; name: string; short_code: string; mark_key: string | null; org_name: string | null } | null;
  };
  cohort: {
    total: number;
    behind: number;
    on_the_way: number;
    almost_done: number;
    required: number;
    stations: { student_id: string; name: string; hours: number; required: number; state: "behind" | "on-the-way" | "almost-done" }[];
  };
  appeals: { count: number; oldest_days: number; kinds: string[]; names: string[] };
  this_week: { date: string; kind: string; title: string; line: string; link: string }[];
  absences_week: { filed: number; half_days: number };
  evaluations: { done: number; of: number };
};

/** The departures board's code column, by action row. */
const CODES: Record<string, string> = {
  concerns: "CONCERN",
  flagged_logs: "FLAG",
  unassigned: "ASSIGN",
  agreements: "MOA",
  slow_reviews: "NUDGE",
  pending_logs: "WAITING",
  pending_tasks: "WAITING",
  missed_days: "NUDGE",
  at_risk: "BEHIND",
  overdue_tasks: "OVERDUE",
};

const KIND_WORDS: Record<string, string> = {
  time_in_rejection: "photo rejection",
  time_correction: "time correction",
  attendance_rejection: "a rejected day",
};

const days = (count: number) => (count === 1 ? "1 day" : `${count} days`);

export default function CoordinatorDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [actions, setActions] = useState<Actions | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const coordinatorName = useAccount("coordinator")?.name?.trim() ?? "";
  const navigate = useNavigate();
  const wide = useMediaQuery("(min-width: 1024px)");
  useLaunchReady(!loading);
  const studentFilters = useStudentFilters();
  const query = studentFilters.query ? `?${studentFilters.query}` : "";

  const load = useCallback(async () => {
    try {
      const [summary, list, extra] = await Promise.all([
        coordinatorRequest<DashboardData>(`/api/coordinator/dashboard${query}`),
        coordinatorRequest<Actions>(`/api/coordinator/actions${query}`),
        coordinatorRequest<Home>(`/api/coordinator/home${query}`),
      ]);
      setData(summary);
      setActions(list);
      setHome(extra);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the home page."));
    } finally {
      setLoading(false);
    }
  }, [query]);

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

  const firstName = coordinatorName.split(/\s+/)[0] || "";
  const scopeWords = [home?.scope.college?.short_name, home?.scope.program?.short_code].filter(Boolean).join(" · ");
  const weekWords = home?.week ? `Week ${home.week.number} of ${home.week.of}` : "";
  const rows = actions ? actions.groups.flatMap((group) => group.rows) : [];
  const waitingLogs = rows.find((row) => row.key === "pending_logs")?.count ?? 0;
  const busiest = actions?.supervisor_queues.find((queue) => queue.waiting > 0);

  return (
    <CoordinatorLayout
      title={wide ? `${greetingFor(new Date())}${firstName ? `, ${firstName}` : ""}` : "Home"}
      subtitle={
        wide
          ? [formatPhDay(phToday(), { weekday: "long", month: "short", day: "numeric" }), weekWords.toLowerCase()].filter(Boolean).join(" · ")
          : [weekWords, scopeWords].filter(Boolean).join(" · ") || "Pangasinan State University · Lingayen Campus"
      }
    >
      <div className="space-y-4">
        <FilterBar state={studentFilters} />
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <CohortCard home={home} loading={loading} onOpen={(id) => navigate(`/coordinator/students/${encodeURIComponent(id)}`)} />

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <NeedsYou home={home} rows={rows} loading={loading} onReminded={() => void load()} />
          {wide ? (
            <ThisWeek home={home} loading={loading} />
          ) : (
            <SplitFacts>
              <Fact title="Timed in today" tip="Active trainees with a time-in today." value={data?.today.timedIn} unit={data ? `of ${data.students.active}` : ""} line={actions ? `${actions.scheduled_not_in} not in yet` : ""} loading={loading} />
              <Fact title="Waiting on supervisors" tip="Attendance logs waiting for the assigned supervisor to verify." value={waitingLogs} unit={waitingLogs === 1 ? "log" : "logs"} line={busiest ? `Most with ${busiest.name}` : "None waiting"} loading={loading} />
            </SplitFacts>
          )}
        </div>

        {wide && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <FactCard title="Timed in today" tip="Active trainees with a time-in today." value={data?.today.timedIn} unit={data ? `of ${data.students.active}` : ""} line={actions ? `${actions.scheduled_not_in} not in yet` : ""} to="/coordinator/monitoring" action="See who" loading={loading} />
            <FactCard title="Waiting on supervisors" tip="Attendance logs waiting for the assigned supervisor to verify." value={waitingLogs} unit={waitingLogs === 1 ? "log" : "logs"} line={busiest ? `Most with ${busiest.name}` : "None waiting"} to="/coordinator/companies?tab=supervisors" action="By supervisor" loading={loading} />
            <FactCard title="Behind schedule" tip="Trainees whose expected finish, from their schedule and verified hours, falls after the term ends, or who have nothing scheduled." value={home?.cohort.behind} unit="trainees" line="May finish after the term ends" to="/coordinator/monitoring?risk=1" action="See them" loading={loading} />
            <FactCard title="Evaluations done" tip="Trainees with a final evaluation from their supervisor." value={home?.evaluations.done} unit={home ? `of ${home.evaluations.of}` : ""} line="Opens as each trainee finishes" to="/coordinator/evaluations" action="See list" loading={loading} />
            <FactCard title="Absences this week" tip="Absences filed for Monday to Sunday of this week." value={home?.absences_week.filed} unit="filed" line={home ? `${home.absences_week.half_days} ${home.absences_week.half_days === 1 ? "is a half-day" : "are half-days"}` : ""} to="/coordinator/monitoring" action="See list" loading={loading} />
            <FactCard title="On the clock now" tip="Timed in today and not yet timed out." value={data?.today.onTheClock} unit="trainees" line={data ? `${data.today.absent} absent today` : ""} to="/coordinator/monitoring" action="Monitoring" loading={loading} />
          </div>
        )}

        {!wide && <ThisWeek home={home} loading={loading} />}
      </div>
    </CoordinatorLayout>
  );
}

/* ---------- The cohort as a route ---------- */

function CohortCard({ home, loading, onOpen }: { home: Home | null; loading: boolean; onOpen: (id: string) => void }) {
  if (loading || !home) {
    // The card's own frame with placeholders, so nothing below moves when it fills in.
    return (
      <section className="card-hairline overflow-hidden rounded-2xl" aria-busy="true" aria-label="The cohort, loading">
        <div className="grid-paper px-4 pb-3 pt-4 sm:px-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[15px] w-40" />
              <Skeleton className="mt-1.5 h-[24px] w-56 max-w-full" />
            </div>
          </div>
          <div className="mt-4">
            <RouteLine stations={[]} required={1} />
          </div>
          <div className="mt-1 flex justify-between">
            <Skeleton className="h-[18px] w-8" />
            <Skeleton className="h-[18px] w-10" />
            <Skeleton className="h-[18px] w-10" />
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-(--role-hairline) bg-white">
          {["behind", "on their way", "almost done"].map((label, index) => (
            <p key={label} className={`px-4 py-3 ${index > 0 ? "border-l border-(--role-hairline)" : ""}`}>
              <Skeleton className="h-[24px] w-8" />
              <span className="text-[13px] text-slate-600">{label}</span>
            </p>
          ))}
        </div>
      </section>
    );
  }
  const { college, program } = home.scope;
  const { cohort } = home;
  const who = `${cohort.total} ${program?.short_code ? `${program.short_code} ` : ""}${cohort.total === 1 ? "trainee" : "trainees"} on the road`;
  return (
    <section className="card-hairline overflow-hidden rounded-2xl" aria-labelledby="cohort-title">
      <div className="grid-paper px-4 pb-3 pt-4 sm:px-5">
        <div className="flex items-center gap-3">
          {college ? (
            <CollegeMark shortName={college.short_name} markKey={college.mark_key} size={40} alt={`${college.name} seal`} />
          ) : (
            <PsuSeal size={40} clearSpace={false} />
          )}
          <div className="min-w-0 flex-1">
            <p className="eyebrow truncate text-psu-700">{college ? college.name : "Pangasinan State University"}</p>
            <h2 id="cohort-title" className="font-display truncate text-[20px] font-extrabold text-slate-900">
              {who}
            </h2>
          </div>
          {program && (
            <span className="flex items-center gap-1">
              <ProgramMark shortCode={program.short_code} markKey={program.mark_key} size={34} alt={program.org_name ? `${program.org_name} logo` : `${program.short_code} monogram`} />
              {program.org_name && <InfoTip label={`About the ${program.short_code} mark`} text={`${program.org_name}, the student organisation of ${program.name}.`} />}
            </span>
          )}
          <InfoTip label="About the cohort line" text={`Each station is a trainee at their verified hours. Red: behind, may finish after the term ends. Navy: on the way. Green: within the last tenth of their hours.`} />
        </div>
        {cohort.total === 0 ? (
          <p className="py-6 text-sm text-slate-600">No active trainees for these filters.</p>
        ) : (
          <>
            <div className="mt-4">
              <RouteLine
                stations={cohort.stations.map((station) => ({ key: station.student_id, initials: getInitials(station.name, "ST"), name: station.name, hours: station.hours, state: station.state }))}
                required={cohort.required || Math.max(...cohort.stations.map((station) => station.required), 1)}
                onOpen={onOpen}
              />
            </div>
            <div className="tabular mt-1 flex justify-between text-[12px] text-slate-600">
              <span>0 h</span>
              <span>{formatHours((cohort.required || 0) / 2)}</span>
              <span>{formatHours(cohort.required)}</span>
            </div>
          </>
        )}
      </div>
      <div className="grid grid-cols-3 border-t border-(--role-hairline) bg-white">
        {[
          { label: "behind", value: cohort.behind, tone: "text-(--status-late-ink)" },
          { label: "on their way", value: cohort.on_the_way, tone: "text-slate-900" },
          { label: "almost done", value: cohort.almost_done, tone: "text-(--status-success-ink)" },
        ].map((item, index) => (
          <p key={item.label} className={`px-4 py-3 ${index > 0 ? "border-l border-(--role-hairline)" : ""}`}>
            <span className={`font-display tabular block text-[24px] font-extrabold leading-none ${item.tone}`}>{item.value}</span>
            <span className="text-[13px] text-slate-600">{item.label}</span>
          </p>
        ))}
      </div>
    </section>
  );
}

/* ---------- Needs you: a departures board ---------- */

function NeedsYou({ home, rows, loading, onReminded }: { home: Home | null; rows: ActionRow[]; loading: boolean; onReminded: () => void }) {
  const appeals = home?.appeals;
  // Logs and tasks waiting on supervisors are theirs; they show as a figure, not here.
  const listed = rows.filter((row) => row.key !== "pending_logs" && row.key !== "pending_tasks");
  const total = (appeals?.count ?? 0) + listed.reduce((sum, row) => sum + row.count, 0);
  return (
    <section className="overflow-hidden rounded-2xl border border-(--status-late-ink)/25 bg-white" aria-labelledby="needs-title">
      <div className="flex items-center gap-3 bg-(--status-late-bg)/60 px-4 py-3">
        <span className="font-display tabular grid h-9 min-w-9 place-items-center rounded-lg bg-(--status-late-ink) px-2 text-[18px] font-extrabold text-white">{loading ? "–" : total}</span>
        <h2 id="needs-title" className="font-display text-[22px] font-extrabold text-(--status-late-ink)">
          Needs you
        </h2>
        <Link to="/coordinator/resolution" className="ml-auto inline-flex min-h-11 items-center gap-1 text-sm font-bold text-(--status-late-ink) hover:underline">
          Open Decide
          <Icon name="chevron-right" size={15} />
        </Link>
      </div>
      {loading ? (
        <SkeletonRows rows={3} />
      ) : total === 0 ? (
        <p className="border-t border-(--role-hairline) px-4 py-5 text-sm text-slate-600">Nothing needs you right now.</p>
      ) : (
        <div>
          {appeals && appeals.count > 0 && (
            <DeparturesRow
              first
              code={`APPEAL ×${appeals.count}`}
              title={`${appeals.count === 1 ? "An appeal" : `${appeals.count} appeals`} to decide`}
              detail={appeals.kinds.map((kind) => KIND_WORDS[kind] ?? kind).join(", ")}
              age={`oldest ${days(appeals.oldest_days)}`}
              action={
                <Link to="/coordinator/resolution?tab=appeals" className="inline-flex min-h-11 items-center rounded-lg bg-(--status-late-ink) px-4 text-sm font-bold text-white hover:bg-red-800">
                  Decide
                </Link>
              }
            />
          )}
          {listed.map((row, index) => (
            <div key={row.key}>
              <DeparturesRow
                first={!appeals?.count && index === 0}
                code={`${CODES[row.key] ?? "ACTION"}${row.count > 1 ? ` ×${row.count}` : ""}`}
                title={row.label.charAt(0).toUpperCase() + row.label.slice(1)}
                detail={row.names?.length ? row.names.slice(0, 2).join(", ") : row.reason}
                action={
                  <Link to={row.link} className="inline-flex min-h-11 items-center rounded-lg border-[1.5px] border-psu-600 px-3.5 text-sm font-bold text-psu-700 hover:bg-psu-50">
                    Open
                  </Link>
                }
              />
              {row.people && row.people.length > 0 && <RemindList people={row.people} onSent={onReminded} />}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The supervisors slow to review, each with a button that sends a reminder
 * of what is waiting ("Nudge"). The server allows one a day for each.
 */
function RemindList({ people, onSent }: { people: NonNullable<ActionRow["people"]>; onSent: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  const remind = async (person: { id: string; name: string }) => {
    setBusy(person.id);
    try {
      const data = await coordinatorRequest<{ message?: string }>(`/api/coordinator/supervisors/${encodeURIComponent(person.id)}/remind`, { method: "POST", body: {} });
      toast.success(data.message || `${person.name} was reminded.`);
      setSent((current) => new Set(current).add(person.id));
      onSent();
    } catch (error) {
      toast.error(errorText(error, "The reminder could not be sent."));
      onSent();
    } finally {
      setBusy(null);
    }
  };
  return (
    <ul className="divide-y divide-(--role-hairline) border-t border-(--role-hairline) bg-slate-50/50">
      {people.map((person) => {
        const done = person.reminded_today || sent.has(person.id);
        return (
          <li key={person.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 pl-4 pr-4 sm:pl-[8.5rem]">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{person.name}</span>
              <span className="block text-xs text-slate-600">{person.detail}</span>
            </span>
            {done ? (
              <span className="text-sm text-slate-600">Reminded today</span>
            ) : (
              <Button variant="outline" busy={busy === person.id} onClick={() => void remind(person)}>
                Remind<span className="sr-only"> {person.name}</span>
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Figures ---------- */

function Fact({ title, tip, value, unit, line, loading }: { title: string; tip: string; value: number | undefined; unit: string; line: string; loading: boolean }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-1">
        <h3 className="eyebrow text-slate-600">{title}</h3>
        <InfoTip label={`About ${title.toLowerCase()}`} text={tip} />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <p className="mt-1">
          <span className="font-display tabular text-[28px] font-extrabold leading-none text-slate-900">{value ?? 0}</span> <span className="text-[13.5px] text-slate-700">{unit}</span>
        </p>
      )}
      <p className="mt-1 text-[12.5px] text-slate-600">{line}</p>
    </div>
  );
}

function FactCard(props: { title: string; tip: string; value: number | undefined; unit: string; line: string; to: string; action: string; loading: boolean }) {
  return (
    <div className="card-hairline flex flex-col rounded-2xl p-4">
      <Fact {...props} />
      <Link to={props.to} className="mt-auto inline-flex min-h-11 items-center gap-1 pt-1 text-sm font-bold text-psu-700 hover:underline">
        {props.action}
        <Icon name="arrow-right" size={15} />
      </Link>
    </div>
  );
}

/* ---------- This week ---------- */

function ThisWeek({ home, loading }: { home: Home | null; loading: boolean }) {
  return (
    <Card>
      <div className="flex items-center justify-between px-4 pt-3.5">
        <h2 className="text-[16px] font-bold text-slate-900">This week</h2>
        <Link to="/coordinator/holidays" className="inline-flex min-h-11 items-center text-sm font-bold text-psu-700 hover:underline">
          Calendar
        </Link>
      </div>
      {loading || !home ? (
        <SkeletonRows rows={3} />
      ) : home.this_week.length === 0 ? (
        <p className="px-4 pb-4 text-[14px] text-slate-600">Nothing dated in the next seven days.</p>
      ) : (
        <ul className="mt-1 divide-y divide-(--role-hairline) border-t border-(--role-hairline)">
          {home.this_week.slice(0, 6).map((row) => (
            <li key={`${row.date}-${row.title}`}>
              <Link to={row.link} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-psu-50/50">
                <span className="w-11 shrink-0 rounded-lg bg-psu-50 py-1 text-center leading-none" aria-hidden="true">
                  <span className="block text-[10.5px] font-bold uppercase text-psu-700">{formatPhDay(row.date, { weekday: "short" })}</span>
                  <span className="font-display tabular block text-[18px] font-extrabold text-slate-900">{formatPhDay(row.date, { day: "numeric" })}</span>
                </span>
                <span className="min-w-0">
                  <span className="sr-only">{formatDayDate(row.date)}: </span>
                  <span className="block truncate text-[14.5px] font-bold text-slate-900">{row.title}</span>
                  <span className="block truncate text-[13px] text-slate-600">{row.line}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
