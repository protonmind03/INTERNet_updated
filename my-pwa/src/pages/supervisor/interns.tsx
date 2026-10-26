import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SummaryTiles } from "../../components/display";
import Icon, { type IconName } from "../../components/Icon";
import { Avatar, Button, Card, EmptyState, ErrorNotice, Modal, ProgressBar, ProgressRing, Skeleton } from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { formatHours, formatTime, getInitials } from "../../lib/format";
import { formatPhDay, phAddDays, phToday } from "../../lib/phTime";
import { useAccount } from "../../lib/session";
import { useProjections, type Projection } from "../../lib/useProjections";
import ProjectionLine from "../../components/ProjectionLine";
import { internPath } from "./internPath";
import InternGroupSelect from "./InternGroups";
import { todaysLogs } from "./reviewData";
import { useInternGroups } from "./useInternGroups";
import { useSupervisorWork, type AbsenceEntry, type AttendanceEntry, type Intern, type QueueItem, type SupervisorWork } from "./useSupervisorWork";
import { useTeams } from "./useTeams";
import { sameId } from "../../lib/ids";

/*
|--------------------------------------------------------------------------
| INTERNS (sv10-26: the same facts, organised)
|--------------------------------------------------------------------------
|
| Each intern at a glance: how far along (a ring), where they are today
| (in since, out at, not in yet, absent), how their week went (Monday to
| Friday), when they finish at their pace and whether that is at risk, and
| what of theirs waits for the supervisor, kind by kind. The tiles filter;
| Sort and a Cards / Table switch arrange; a team narrows. A card opens the
| short look (InternDialog), and from there their page.
|
*/

type Shown = "all" | "waiting" | "risk" | "almost";
type Sort = "needs" | "name" | "progress" | "finish";
type Layout = "cards" | "table";

/** Within this share of their hours, an intern counts as almost done (the coordinator's Home uses the same tenth). */
const ALMOST_DONE = 90;

const SORTS: { value: Sort; label: string }[] = [
  { value: "needs", label: "Needs you first" },
  { value: "name", label: "Name" },
  { value: "progress", label: "Most hours first" },
  { value: "finish", label: "Finishing soonest" },
];

const WAIT_KIND: Record<QueueItem["kind"], { one: string; many: string; icon: IconName }> = {
  attendance: { one: "time-in", many: "time-ins", icon: "camera" },
  task: { one: "task", many: "tasks", icon: "tasks" },
  document: { one: "document", many: "documents", icon: "document" },
  absence: { one: "absence", many: "absences", icon: "calendar" },
  journal: { one: "weekly report", many: "weekly reports", icon: "note" },
};

type Today = { tone: "in" | "out" | "absent" | "none"; text: string };

/** Where an intern is today, from today's log or a filed absence. */
function todayOf(log: AttendanceEntry | undefined, absence: AbsenceEntry | undefined): Today {
  if (log && !log.time_out) return { tone: "in", text: `In since ${formatTime(log.time_in)}` };
  if (log) return { tone: "out", text: `Out ${formatTime(log.time_out)} · ${formatHours(log.hours)}` };
  if (absence) return { tone: "absent", text: absence.status === "Pending" ? "Absent · to review" : `Absent · ${absence.status.toLowerCase()}` };
  return { tone: "none", text: "Not in yet" };
}

const TODAY_TONE: Record<Today["tone"], string> = {
  in: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  out: "bg-slate-50 text-slate-700 ring-slate-200",
  absent: "bg-amber-50 text-amber-900 ring-amber-200",
  none: "bg-white text-slate-500 ring-slate-200",
};

type DayMark = { day: string; label: string; state: "verified" | "pending" | "rejected" | "absent" | "none" | "future" };

/** Monday to Friday of this week, each day's mark. */
function weekOf(studentId: string, attendance: AttendanceEntry[], absences: AbsenceEntry[], today: string): DayMark[] {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sunday
  const monday = phAddDays(today, weekday === 0 ? -6 : 1 - weekday);
  return [0, 1, 2, 3, 4].map((offset) => {
    const day = phAddDays(monday, offset);
    const label = formatPhDay(day, { weekday: "narrow" });
    if (day > today) return { day, label, state: "future" as const };
    const log = attendance.find((entry) => sameId(entry.student_id, studentId) && String(entry.date).slice(0, 10) === day);
    if (log) return { day, label, state: log.status === "Verified" ? "verified" : log.status === "Rejected" ? "rejected" : "pending" };
    if (absences.some((item) => sameId(item.student_id, studentId) && String(item.date).slice(0, 10) === day)) return { day, label, state: "absent" };
    return { day, label, state: "none" };
  });
}

const DAY_STYLE: Record<DayMark["state"], { cell: string; word: string }> = {
  verified: { cell: "bg-psu-600 text-white", word: "verified" },
  pending: { cell: "bg-sky-100 text-sky-900 ring-1 ring-inset ring-sky-300", word: "to verify" },
  rejected: { cell: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-300", word: "rejected" },
  absent: { cell: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300", word: "absent" },
  none: { cell: "bg-slate-100 text-slate-400", word: "no log" },
  future: { cell: "bg-white text-slate-300 ring-1 ring-inset ring-dashed ring-slate-200", word: "ahead" },
};

function WeekStrip({ days }: { days: DayMark[] }) {
  return (
    <ol className="flex gap-1" aria-label="This week">
      {days.map((mark) => (
        <li
          key={mark.day}
          className={`grid h-7 w-7 place-items-center rounded-md text-[11px] font-bold ${DAY_STYLE[mark.state].cell}`}
          title={`${formatPhDay(mark.day, { weekday: "long", month: "short", day: "numeric" })}: ${DAY_STYLE[mark.state].word}`}
        >
          <span aria-hidden="true">{mark.label}</span>
          <span className="sr-only">
            {formatPhDay(mark.day, { weekday: "long" })} {DAY_STYLE[mark.state].word}
          </span>
        </li>
      ))}
    </ol>
  );
}

function finishText(projection: Projection | undefined): { text: string; risk: boolean } {
  if (!projection) return { text: "—", risk: false };
  if (!projection.projected_finish) return { text: projection.remaining_hours <= 0 ? "Done" : "—", risk: projection.at_risk };
  return { text: formatPhDay(projection.projected_finish, { month: "short", day: "numeric" }), risk: projection.at_risk };
}

export default function SupervisorInterns() {
  const supervisor = useAccount("supervisor");
  const work = useSupervisorWork(supervisor?.supervisor_id);
  const { interns, loading } = work;
  const projections = useProjections("supervisor");
  const teams = useTeams();
  const grouping = useInternGroups();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [shown, setShown] = useState<Shown>("all");
  const [sort, setSort] = useState<Sort>("needs");
  const [teamId, setTeamId] = useState("");
  const layout: Layout = params.get("view") === "table" ? "table" : "cards";
  const setLayout = (next: Layout) => setParams(next === "table" ? { view: "table" } : {}, { replace: true });
  const [openId, setOpenId] = useState<string | null>(null);

  const today = phToday();
  const logs = useMemo(() => todaysLogs(work), [work]);
  const absenceToday = useCallback(
    (studentId: string) => work.absences.find((item) => sameId(item.student_id, studentId) && String(item.date).slice(0, 10) === today),
    [work.absences, today]
  );
  const waitingOf = useCallback((studentId: string) => work.queue.filter((item) => sameId(item.entry.student_id, studentId)), [work.queue]);
  const teamsOf = useCallback(
    (studentId: string) => teams.list.filter((team) => team.members.some((member) => sameId(member.student_id, studentId))),
    [teams.list]
  );
  const logOf = useCallback(
    (studentId: string) => {
      for (const [id, entry] of logs) if (sameId(id, studentId)) return entry;
      return undefined;
    },
    [logs]
  );

  // Which interns each tile counts: the tiles are the page's filter.
  const fits = useCallback(
    (intern: Intern, which: Shown) =>
      which === "all" ||
      (which === "waiting" && waitingOf(intern.student_id).length > 0) ||
      (which === "risk" && Boolean(projections.get(String(intern.student_id))?.at_risk)) ||
      (which === "almost" && intern.completion >= ALMOST_DONE),
    [waitingOf, projections]
  );
  const visible = useMemo(() => {
    const text = search.trim().toLowerCase();
    const team = teams.list.find((each) => String(each.id) === teamId);
    const list = interns.filter(
      (intern) =>
        fits(intern, shown) &&
        grouping.has(intern.student_id) &&
        (!team || team.members.some((member) => sameId(member.student_id, intern.student_id))) &&
        (!text ||
          [intern.name, intern.student_id, intern.program, intern.email, intern.block_name]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(text)))
    );
    const finishKey = (intern: Intern) => projections.get(String(intern.student_id))?.projected_finish ?? "9999";
    return [...list].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "progress"
          ? b.completion - a.completion
          : sort === "finish"
            ? finishKey(a).localeCompare(finishKey(b))
            : waitingOf(b.student_id).length - waitingOf(a.student_id).length || a.name.localeCompare(b.name)
    );
  }, [interns, search, shown, fits, grouping, teamId, teams.list, sort, projections, waitingOf]);
  const countOf = (which: Shown) => (loading ? null : interns.filter((intern) => fits(intern, which)).length);

  const inToday = interns.filter((intern) => logOf(intern.student_id)).length;
  const average = interns.length ? Math.round(interns.reduce((sum, intern) => sum + (Number(intern.completion) || 0), 0) / interns.length) : 0;
  const opened = interns.find((intern) => sameId(intern.student_id, openId)) ?? null;

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

        {!loading && interns.length > 0 && (
          // The group as a whole: who is in, how far along together.
          <section aria-label="Your interns today" className="interns-hero relative overflow-hidden rounded-2xl p-5 text-white sm:p-6">
            <div className="relative flex flex-wrap items-center gap-x-8 gap-y-4">
              <ProgressRing value={average} size={86} stroke={8} label={`On average ${average} percent of their hours`}>
                <span className="font-display text-[22px] font-extrabold text-white">{average}%</span>
              </ProgressRing>
              <div className="min-w-0">
                <p className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-white/75">Your interns, together</p>
                <p className="font-display text-[22px] font-extrabold leading-tight">
                  {inToday} of {interns.length} in today
                </p>
                <p className="text-[14px] text-white/80">
                  {formatHours(interns.reduce((sum, intern) => sum + (Number(intern.hours_rendered) || 0), 0))} verified ·{" "}
                  {countOf("waiting")} with work waiting for you
                </p>
              </div>
              <ul className="ml-auto flex -space-x-2" aria-label="Who is in today">
                {interns.slice(0, 8).map((intern) => {
                  const present = Boolean(logOf(intern.student_id));
                  return (
                    <li
                      key={intern.student_id}
                      title={`${intern.name}: ${present ? "in today" : "not in yet"}`}
                      className={`grid h-10 w-10 place-items-center rounded-full border-2 text-[12px] font-extrabold ${
                        present ? "border-emerald-300 bg-white text-psu-800" : "border-white/30 bg-white/15 text-white/70"
                      }`}
                    >
                      <span aria-hidden="true">{getInitials(intern.name)}</span>
                      <span className="sr-only">
                        {intern.name}, {present ? "in today" : "not in yet"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        {!loading && interns.length > 0 && (
          <SummaryTiles
            label="Show interns"
            value={shown}
            onChange={setShown}
            tiles={[
              { value: "all", label: "All interns", count: countOf("all"), icon: "users", tone: "brand" },
              { value: "waiting", label: "Work waiting for you", count: countOf("waiting"), icon: "inbox", tone: (countOf("waiting") ?? 0) > 0 ? "warning" : "neutral" },
              { value: "risk", label: "At risk of finishing late", count: countOf("risk"), icon: "alert", tone: (countOf("risk") ?? 0) > 0 ? "danger" : "neutral" },
              { value: "almost", label: "Almost done", count: countOf("almost"), icon: "check-circle", tone: "success" },
            ]}
          />
        )}

        {!loading && interns.length > 0 && (
          // One line of tools: find, narrow, arrange.
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="relative block min-w-0 flex-1 basis-56 sm:max-w-xs">
              <span className="sr-only">Search interns</span>
              <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, ID or program" className="field pl-9" />
            </label>
            <InternGroupSelect state={grouping} />
            {teams.list.length > 0 && (
              <label className="block">
                <span className="sr-only">Team</span>
                <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="field w-auto">
                  <option value="">Every team</option>
                  {teams.list.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="sr-only">Sort</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="field w-auto" aria-label="Sort interns">
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div role="group" aria-label="Layout" className="ml-auto inline-flex rounded-xl bg-slate-100 p-1">
              {(["cards", "table"] as Layout[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={layout === value}
                  onClick={() => setLayout(value)}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors ${
                    layout === value ? "bg-white text-psu-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Icon name={value === "cards" ? "grid" : "list"} size={15} />
                  {value === "cards" ? "Cards" : "Table"}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((card) => (
              <Card key={card} className="space-y-3 p-5">
                <Skeleton className="h-14 w-14 rounded-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-2 w-full" />
              </Card>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon="users"
              title={interns.length === 0 ? "No interns yet" : "No interns match"}
              description={interns.length === 0 ? "Your OJT coordinator assigns students to you." : undefined}
            />
          </Card>
        ) : layout === "cards" ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((intern, index) => {
              const waiting = waitingOf(intern.student_id);
              const now = todayOf(logOf(intern.student_id), absenceToday(intern.student_id));
              const finish = finishText(projections.get(String(intern.student_id)));
              const left = Math.max(0, (Number(intern.required_hours) || 0) - (Number(intern.hours_rendered) || 0));
              const kinds = (Object.keys(WAIT_KIND) as QueueItem["kind"][])
                .map((kind) => ({ kind, count: waiting.filter((item) => item.kind === kind).length }))
                .filter((each) => each.count > 0);
              return (
                <li key={intern.student_id} className="intern-card" style={{ ["--i" as string]: index }}>
                  <button
                    type="button"
                    onClick={() => setOpenId(intern.student_id)}
                    className={`group relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white text-left ring-1 ring-inset transition-all hover:-translate-y-0.5 hover:shadow-raised ${
                      waiting.length > 0 ? "ring-amber-300" : "ring-(--role-hairline)"
                    }`}
                  >
                    <span aria-hidden="true" className={`h-1.5 w-full ${finish.risk ? "bg-red-500" : intern.completion >= ALMOST_DONE ? "bg-emerald-500" : "bg-psu-600"}`} />
                    <div className="flex items-start gap-4 p-5 pb-3">
                      <ProgressRing value={intern.completion} size={64} stroke={6} label={`${intern.completion} percent of required hours`}>
                        <span className="text-[13px] font-extrabold text-psu-800">{Math.round(intern.completion)}%</span>
                      </ProgressRing>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15.5px] font-bold text-slate-900">{intern.name}</span>
                        <span className="block truncate text-[13px] text-slate-600">
                          {[intern.block_name || intern.program_code || intern.program, intern.student_id].filter(Boolean).join(" · ")}
                        </span>
                        <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-bold ring-1 ring-inset ${TODAY_TONE[now.tone]}`}>
                          {now.tone === "in" && <span className="live-dot" aria-hidden="true" />}
                          {now.text}
                        </span>
                      </span>
                      {waiting.length > 0 && (
                        <span className="grid h-8 min-w-8 place-items-center rounded-full bg-amber-400 px-2 text-[13px] font-extrabold text-psu-900" title={`${waiting.length} waiting for you`}>
                          {waiting.length}
                          <span className="sr-only"> waiting for you</span>
                        </span>
                      )}
                    </div>
                    <dl className="mx-5 grid grid-cols-3 divide-x divide-(--role-hairline) rounded-xl bg-slate-50 py-2 text-center">
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Verified</dt>
                        <dd className="tabular text-[14.5px] font-bold text-slate-900">{formatHours(intern.hours_rendered)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">To go</dt>
                        <dd className="tabular text-[14.5px] font-bold text-slate-900">{formatHours(left)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Finish</dt>
                        <dd className={`tabular text-[14.5px] font-bold ${finish.risk ? "text-red-700" : "text-slate-900"}`}>
                          {finish.text}
                          {finish.risk && <span className="sr-only"> (at risk)</span>}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex items-center justify-between gap-3 px-5 pt-3">
                      <span className="text-[12px] font-bold uppercase tracking-wide text-slate-500">This week</span>
                      <WeekStrip days={weekOf(intern.student_id, work.attendance, work.absences, today)} />
                    </div>
                    <div className="mt-auto flex flex-wrap items-center gap-1.5 px-5 pb-4 pt-3">
                      {kinds.map(({ kind, count }) => (
                        <span key={kind} className="st-badge st-badge--waiting">
                          <Icon name={WAIT_KIND[kind].icon} size={12} />
                          {count} {count === 1 ? WAIT_KIND[kind].one : WAIT_KIND[kind].many}
                        </span>
                      ))}
                      {teamsOf(intern.student_id).map((team) => (
                        <span key={team.id} className="st-badge bg-psu-50 text-psu-800">
                          <Icon name="users" size={12} />
                          {team.name}
                        </span>
                      ))}
                      {kinds.length === 0 && teamsOf(intern.student_id).length === 0 && (
                        <span className="text-[13px] text-slate-500">
                          {intern.active_tasks} open {intern.active_tasks === 1 ? "task" : "tasks"} · nothing waiting for you
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="table-head border-b border-slate-100 text-xs text-slate-500">
                  <th scope="col" className="px-5 py-3 font-medium">Intern</th>
                  <th scope="col" className="px-3 py-3 font-medium">Today</th>
                  <th scope="col" className="px-3 py-3 font-medium">Hours</th>
                  <th scope="col" className="px-3 py-3 font-medium">This week</th>
                  <th scope="col" className="px-3 py-3 font-medium">Finish</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Waiting</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((intern) => {
                  const waiting = waitingOf(intern.student_id).length;
                  const now = todayOf(logOf(intern.student_id), absenceToday(intern.student_id));
                  const finish = finishText(projections.get(String(intern.student_id)));
                  return (
                    <tr key={intern.student_id} className="cursor-pointer hover:bg-psu-50/40" onClick={() => setOpenId(intern.student_id)}>
                      <td className="px-5 py-3">
                        <button type="button" onClick={() => setOpenId(intern.student_id)} className="flex items-center gap-3 text-left">
                          <Avatar name={intern.name} size="sm" />
                          <span className="min-w-0">
                            <span className="block font-semibold text-slate-900">{intern.name}</span>
                            <span className="block text-xs text-slate-500">{intern.block_name || intern.program_code || intern.program}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-bold ring-1 ring-inset ${TODAY_TONE[now.tone]}`}>{now.text}</span>
                      </td>
                      <td className="w-56 px-3 py-3">
                        <span className="tabular text-[13px] text-slate-700">
                          {formatHours(intern.hours_rendered)} of {formatHours(intern.required_hours)}
                        </span>
                        <ProgressBar value={intern.completion} className="mt-1" label={`${intern.completion} percent of required hours`} />
                      </td>
                      <td className="px-3 py-3">
                        <WeekStrip days={weekOf(intern.student_id, work.attendance, work.absences, today)} />
                      </td>
                      <td className={`tabular px-3 py-3 font-semibold ${finish.risk ? "text-red-700" : "text-slate-800"}`}>
                        {finish.text}
                        {finish.risk && <span className="ml-1 text-[11px] font-bold uppercase">At risk</span>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {waiting > 0 ? <span className="st-badge st-badge--waiting">{waiting} for you</span> : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <InternDialog intern={opened} work={work} onClose={() => setOpenId(null)} />
    </SupervisorLayout>
  );
}

/** Items of this intern's that are waiting for the supervisor's decision. */
function pendingFor(work: SupervisorWork, studentId: string): number {
  return work.queue.filter((item) => sameId(item.entry.student_id, studentId)).length;
}

/**
 * A short look at one intern: where their hours stand, how to reach them,
 * and what is waiting. Everything else is on their page ("Open").
 */
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
  const projections = useProjections("supervisor");
  if (!intern) return null;
  const pending = pendingFor(work, intern.student_id);

  return (
    <Modal
      open
      onClose={onClose}
      title={intern.name}
      description={[intern.student_id, intern.block_name || intern.program].filter(Boolean).join(" · ")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => navigate(internPath(intern.student_id))}>Open</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-700">Hours verified</span>
            <span className="tabular text-slate-900">
              {formatHours(intern.hours_rendered)} of {formatHours(intern.required_hours)} (
              {intern.completion}%)
            </span>
          </div>
          <ProgressBar value={intern.completion} className="mt-2" />
          <ProjectionLine projection={projections.get(intern.student_id)} className="mt-2" />
        </div>

        <dl className="space-y-1 text-sm text-slate-700">
          <div>
            <dt className="inline font-medium">Email: </dt>
            <dd className="inline">
              <a href={`mailto:${intern.email}`} className="break-all text-psu-700 hover:underline">
                {intern.email}
              </a>
            </dd>
          </div>
          {intern.phone && (
            <div>
              <dt className="inline font-medium">Mobile: </dt>
              <dd className="inline">
                <a
                  href={`tel:${intern.phone}`}
                  aria-label={`Call ${intern.name}, ${intern.phone}`}
                  className="inline-flex items-center gap-1 text-psu-700 underline underline-offset-2 hover:text-psu-900"
                >
                  <Icon name="phone" size={14} className="shrink-0" />
                  {intern.phone}
                </a>
              </dd>
            </div>
          )}
          {intern.emergency_contact_phone && (
            <div>
              <dt className="inline font-medium">In an emergency: </dt>
              <dd className="inline">
                {intern.emergency_contact_name ? `${intern.emergency_contact_name}, ` : ""}
                <a
                  href={`tel:${intern.emergency_contact_phone}`}
                  aria-label={`Call the emergency contact, ${intern.emergency_contact_phone}`}
                  className="inline-flex items-center gap-1 text-psu-700 underline underline-offset-2 hover:text-psu-900"
                >
                  <Icon name="phone" size={14} className="shrink-0" />
                  {intern.emergency_contact_phone}
                </a>
              </dd>
            </div>
          )}
        </dl>

        <p className="text-sm text-slate-700">
          {intern.active_tasks} open {intern.active_tasks === 1 ? "task" : "tasks"}
          {pending > 0 ? (
            <span className="font-semibold text-amber-800">
              {" "}
              · {pending} waiting for you
            </span>
          ) : (
            " · nothing waiting for you"
          )}
        </p>
        <p className="text-sm text-slate-600">
          Open their page for attendance, tasks, documents, weekly reports, evaluations, the time record and
          notes with the coordinator.
        </p>
      </div>
    </Modal>
  );
}
