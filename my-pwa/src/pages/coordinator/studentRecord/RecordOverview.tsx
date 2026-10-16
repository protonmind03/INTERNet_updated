import { useId, type ReactNode } from "react";
import Icon, { type IconName } from "../../../components/Icon";
import { EmptyState, ProgressRing, Stars, StatusBadge } from "../../../components/ui";
import { formatDate, formatDayDate, formatHours, formatLongDate, formatTime, getInitials, phDateKey } from "../../../lib/format";
import { StatusRules } from "../StudentPerformance";
import { STATUS_TONE, type PerformanceRules, type PerformanceStudent } from "../performance";
import {
  WEEKDAYS,
  addDays,
  attentionItems,
  clockMinutes,
  dateKey,
  dayInfo,
  daysBetween,
  isOpenLog,
  minutesLabel,
  minutesOf,
  mondayOf,
  monthOf,
  oneDecimal,
  plural,
  weekNumberOf,
  weekRange,
  weekStatus,
  weekdayOf,
  type AttentionAction,
  type AttentionItem,
  type DayInfo,
  type Overview,
  type Owner,
  type Pending,
  type RecordContext,
  type Tone,
  type Week,
  type OverviewState,
  reportLabel,
  reportTone,
  taskLabel,
  taskTone,
} from "./model";
import { CopyButton, DecideButtons } from "./RecordParts";
import { formatPhDay } from "../../../lib/phTime";

/*
|--------------------------------------------------------------------------
| THE RECORD'S OVERVIEW
|--------------------------------------------------------------------------
|
| Read top to bottom in order of urgency: the summary, what is waiting on
| someone, the placement week by week (or a month at a time) with any day
| opening to its full shift, and the rest of the detail folded away.
|
*/

type Props = {
  data: Overview;
  ctx: RecordContext;
  weeks: Week[];
  perf: PerformanceStudent | null;
  rules: PerformanceRules | null;
  canDecide: boolean;
  online: boolean;
  loadedAt: Date;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (action: Extract<AttentionAction, { kind: "open" }>) => void;
  onApprove: (item: Pending) => Promise<void>;
  onReject: (item: Pending) => void;
  state: OverviewState;
  setState: (patch: Partial<OverviewState>) => void;
};

const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-700",
  waiting: "text-amber-700",
  bad: "text-red-700",
  info: "text-psu-700",
  neutral: "text-slate-500",
};

export default function RecordOverview(props: Props) {
  return (
    <div className="space-y-7">
      <Summary {...props} />
      <Attention {...props} />
      <WeekByWeek {...props} />
      <MoreAbout {...props} />
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| SUMMARY
|--------------------------------------------------------------------------
*/

function Summary({ data, perf, rules, online, loadedAt, refreshing, onRefresh, onOpen }: Props) {
  const student = data.student;
  const p = perf?.performance;
  const pct = student.required_hours > 0 ? Math.min(100, (student.hours_rendered / student.required_hours) * 100) : 0;
  const dot = p ? { good: "bg-emerald-500", info: "bg-psu-500", waiting: "bg-amber-500", bad: "bg-red-500" }[STATUS_TONE[p.status]] : "";
  const clock = formatTime(loadedAt);
  const metric = (tab: Parameters<Props["onOpen"]>[0]["tab"], label: string, value: ReactNode, hint: string, warn = false) => (
    <button
      type="button"
      onClick={() => onOpen({ kind: "open", tab, label })}
      className={`group flex min-w-0 flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors hover:border-psu-200 hover:bg-white hover:shadow-card ${
        warn ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"
      }`}
    >
      <span className="flex items-center justify-between gap-1.5 text-xs text-slate-500">
        {label}
        <Icon name="arrow-right" size={13} className="text-slate-400 group-hover:text-psu-600" />
      </span>
      <span className="tabular whitespace-nowrap text-xl font-semibold tracking-tight text-slate-900">{value}</span>
      <span className="truncate text-xs text-slate-500">{hint}</span>
    </button>
  );
  const small = (text: string) => <small className="text-[13px] font-medium text-slate-500">{text}</small>;

  return (
    <section aria-label="Summary" className="grid items-center gap-x-7 gap-y-5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5 md:grid-cols-[auto_minmax(0,1fr)]">
      <ProgressRing value={pct} size={156} stroke={13} label={`${oneDecimal(student.hours_rendered)} of ${student.required_hours} verified hours`}>
        <span className="tabular text-[28px] font-bold leading-none tracking-tight text-slate-900">{Math.round(pct)}%</span>
        <span className="tabular mt-1 text-xs leading-snug text-slate-500">
          {formatHours(student.hours_rendered)} of {formatHours(student.required_hours)}
          <br />
          verified
        </span>
      </ProgressRing>

      <div className="@container min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Performance</span>
          {rules && <StatusRules rules={rules} />}
          <span className="ml-auto inline-flex items-center gap-2 text-xs text-slate-500">
            {online ? `Updated ${clock}` : `Showing what was loaded at ${clock}`}
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing || !online}
              aria-label="Refresh this record"
              title={online ? "Refresh this record" : "You're offline"}
              className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-psu-700 disabled:opacity-50 pointer-coarse:h-10 pointer-coarse:w-10"
            >
              <Icon name="refresh" size={15} className={refreshing ? "animate-spin" : ""} />
            </button>
          </span>
        </div>
        {p ? (
          <>
            <p className="mt-1 flex items-center gap-2.5 text-[26px] font-bold leading-tight tracking-tight text-slate-900">
              <span className={`h-3 w-3 rounded-full ${dot}`} aria-hidden="true" />
              {p.status}
            </p>
            <p className="mt-1.5 max-w-[80ch] text-sm text-slate-700">{p.summary}</p>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-slate-600">
            {student.is_active ? "The performance figures could not be loaded right now." : "Performance figures are kept for active students only."}
          </p>
        )}
        {p && perf && (
          <div className="mt-4 grid grid-cols-2 gap-2.5 @lg:grid-cols-3 @3xl:grid-cols-5">
            {metric(
              "schedule",
              "Finishes",
              p.status === "Completed" ? "Done" : perf.projected_finish ? formatDate(perf.projected_finish).replace(/, \d{4}$/, "") : "No date",
              p.status === "Completed" ? formatDate(student.completed_at) : `${formatHours(perf.remaining_hours)} to go`,
              p.status === "At risk"
            )}
            {metric(
              "attendance",
              "Attendance",
              p.attendance.rate === null ? "–" : <>{p.attendance.rate}{small("%")}</>,
              p.attendance.rate === null ? "No scheduled days yet" : `${p.attendance.attended_days} of ${p.attendance.scheduled_days} days · ${p.late_time_ins} late`,
              p.status === "Behind" && p.attendance.rate !== null && p.attendance.rate < 80
            )}
            {metric("tasks", "Tasks on time", <>{p.tasks.on_time}{small(` of ${p.tasks.assigned}`)}</>, p.tasks.late ? `${p.tasks.late} late` : "None late", p.tasks.late >= 2)}
            {metric("documents", "Requirements", <>{p.requirements.approved}{small(` of ${p.requirements.required}`)}</>, "approved")}
            {metric("journals", "Weekly reports", <>{p.weekly_reports.submitted}{small(` of ${p.weekly_reports.weeks_worked}`)}</>, "weeks covered")}
          </div>
        )}
      </div>
    </section>
  );
}

/*
|--------------------------------------------------------------------------
| NEEDS ATTENTION
|--------------------------------------------------------------------------
*/

const ITEM_TONE: Record<Tone, { stripe: string; icon: string }> = {
  waiting: { stripe: "before:bg-amber-500", icon: "bg-amber-50 text-amber-700" },
  bad: { stripe: "before:bg-red-500", icon: "bg-red-50 text-red-600" },
  info: { stripe: "before:bg-psu-500", icon: "bg-psu-50 text-psu-700" },
  good: { stripe: "before:bg-emerald-500", icon: "bg-emerald-50 text-emerald-700" },
  neutral: { stripe: "before:bg-slate-300", icon: "bg-slate-100 text-slate-600" },
};

function Attention(props: Props) {
  const { data, ctx, weeks, perf, canDecide, online, onOpen, onApprove, onReject, state, setState } = props;
  const figures = perf ? { weeksWorked: perf.performance.weekly_reports.weeks_worked, reportsSubmitted: perf.performance.weekly_reports.submitted } : null;
  const items = attentionItems(data, ctx, weeks, figures, canDecide);
  const student = data.student;
  const first = student.name.split(/\s+/)[0] || "the student";

  if (items.length === 0) {
    return (
      <section aria-labelledby="attention-h" className="flex items-center gap-3.5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700 ring-[6px] ring-emerald-500/10">
          <Icon name="check" />
        </span>
        <div>
          <h2 id="attention-h" className="text-[15px] font-bold text-slate-900">Nothing needs attention</h2>
          <p className="text-sm text-slate-600">Every log, document and report is settled.</p>
        </div>
      </section>
    );
  }

  const owners: Owner[] = ["you", "supervisor", "student"];
  const counts = Object.fromEntries(owners.map((owner) => [owner, items.filter((item) => item.owner === owner).length])) as Record<Owner, number>;
  const owner = state.owner !== "all" && counts[state.owner] === 0 ? "all" : state.owner;
  const ages = items.filter((item) => item.since).map((item) => daysBetween(item.since as string, ctx.today));
  const oldest = ages.length ? Math.max(...ages) : 0;
  const urgent = items.filter((item) => item.tone === "bad").length;
  const ageText = (days: number) => (days <= 0 ? "today" : days === 1 ? "1 day" : `${days} days`);
  const ownerText: Record<Owner, { label: string; sub: string; badge: ReactNode; stuck?: boolean }> = {
    you: {
      label: "For you",
      sub: "You can act on these now.",
      badge: <span className="grid h-7 w-7 place-items-center rounded-full bg-linear-to-br from-psu-600 to-psu-800 text-[10.5px] font-bold text-white">You</span>,
    },
    supervisor: {
      label: student.supervisor_name ? `Waiting on ${student.supervisor_name}` : "Waiting on a supervisor",
      sub: !student.supervisor_name
        ? "No supervisor is assigned, so these are stuck until one is."
        : student.supervisor_active
          ? "The supervisor reviews these."
          : "Their account is deactivated, so these are stuck until a supervisor is assigned.",
      badge: <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-psu-700 ring-1 ring-inset ring-psu-200"><Icon name="briefcase" size={13} /></span>,
      stuck: !student.supervisor_active,
    },
    student: {
      label: `Waiting on ${first}`,
      sub: "The student needs to do these.",
      badge: <span className="grid h-7 w-7 place-items-center rounded-full bg-linear-to-b from-gold-300 to-gold-400 text-[10.5px] font-bold text-psu-950">{getInitials(student.name)}</span>,
    },
  };

  let budget = state.showAll ? Infinity : 5;
  const groups = (owner === "all" ? owners : [owner]).map((who) => {
    const list = items.filter((item) => item.owner === who);
    const shown = list.slice(0, Math.max(0, budget));
    budget -= shown.length;
    return { who, list, shown };
  });
  const total = owner === "all" ? items.length : counts[owner];

  const act = (item: AttentionItem) => {
    const action = item.action;
    if (action.kind === "decide") {
      return (
        <DecideButtons
          approveLabel={action.approveLabel}
          rejectLabel={action.rejectLabel}
          onApprove={() => onApprove(action.target)}
          onReject={() => onReject(action.target)}
          online={online}
        />
      );
    }
    return (
      <button
        type="button"
        onClick={() => onOpen(action)}
        className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 pointer-coarse:h-10"
      >
        {action.label}
      </button>
    );
  };

  return (
    <section aria-labelledby="attention-h" className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-linear-to-b from-gold-50 to-white px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-50 text-gold-700 ring-1 ring-inset ring-gold-600/20">
            <Icon name="alert" size={17} />
          </span>
          <div className="min-w-0">
            <h2 id="attention-h" className="text-[15.5px] font-bold text-slate-900">Needs attention</h2>
            <p className="text-[12.5px] text-slate-600">
              {plural(items.length, "open item", "open items")}
              {urgent > 0 && <span className="font-semibold text-red-700"> · {urgent} urgent</span>}
              {oldest > 0 && ` · oldest waiting ${ageText(oldest)}`}
            </p>
          </div>
        </div>
        <div role="group" aria-label="Show items for" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-[3px] [scrollbar-width:none]">
          {(["all", ...owners.filter((who) => counts[who] > 0)] as ("all" | Owner)[]).map((who) => (
            <button
              key={who}
              type="button"
              aria-pressed={owner === who}
              onClick={() => setState({ owner: who, showAll: false })}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium pointer-coarse:h-10 ${
                owner === who ? "bg-psu-50 text-psu-900 ring-1 ring-inset ring-psu-600/15" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {who === "all" ? "All" : who === "you" ? "For you" : who === "supervisor" ? "Supervisor" : first}
              <span className={`tabular inline-grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-[11px] font-bold ${owner === who ? "bg-psu-700 text-white" : "bg-slate-100 text-slate-600"}`}>
                {who === "all" ? items.length : counts[who]}
              </span>
            </button>
          ))}
        </div>
      </div>
      <ul>
        {groups.map(({ who, list, shown }) =>
          shown.length === 0 ? null : (
            <li key={who}>
              <div className={`flex items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 first:border-t-0 sm:px-5 ${ownerText[who].stuck && who === "supervisor" ? "bg-amber-50" : "bg-slate-50"}`}>
                {ownerText[who].badge}
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <b className="text-[13px] font-bold text-slate-800">{ownerText[who].label}</b>
                  <span className="tabular inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-slate-200 px-1.5 text-[11px] font-bold text-slate-700">{list.length}</span>
                  <small className={`basis-full text-xs ${ownerText[who].stuck && who === "supervisor" ? "text-amber-800" : "text-slate-500"}`}>{ownerText[who].sub}</small>
                </span>
              </div>
              <ul>
                {shown.map((item) => {
                  const days = item.since ? daysBetween(item.since, ctx.today) : null;
                  return (
                    <li
                      key={item.key}
                      className={`relative grid grid-cols-[36px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 border-t border-slate-100 py-3.5 pl-4 pr-4 before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:pl-[22px] sm:pr-5 ${ITEM_TONE[item.tone].stripe}`}
                    >
                      <span className={`grid h-9 w-9 self-start place-items-center rounded-xl sm:h-10 sm:w-10 ${ITEM_TONE[item.tone].icon}`}>
                        <Icon name={item.icon} size={16} />
                      </span>
                      <div className="min-w-0">
                        <div className="mb-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{item.topic}</span>
                          {days !== null && (
                            <span className={`inline-flex items-center gap-1 text-xs ${days >= 7 ? "font-semibold text-red-700" : days >= 3 ? "text-amber-700" : "text-slate-500"}`}>
                              <Icon name="clock" size={12} />
                              {item.verb || "Waiting"} {ageText(days)}
                            </span>
                          )}
                        </div>
                        <p className="text-[14.5px] font-semibold text-slate-900">{item.title}</p>
                        {item.text && <p className="text-[13px] text-slate-600 sm:truncate">{item.text}</p>}
                      </div>
                      <div className="col-start-2 flex flex-wrap gap-1.5 sm:col-start-auto sm:justify-end">{act(item)}</div>
                    </li>
                  );
                })}
              </ul>
            </li>
          )
        )}
      </ul>
      {total > 5 && (
        <button
          type="button"
          onClick={() => setState({ showAll: !state.showAll })}
          className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 py-2.5 text-[13px] font-semibold text-psu-700 hover:bg-psu-50"
        >
          {state.showAll ? "Show fewer" : `Show all ${total}`}
          <Icon name="chevron-down" size={13} className={state.showAll ? "rotate-180" : ""} />
        </button>
      )}
    </section>
  );
}

/*
|--------------------------------------------------------------------------
| WEEK BY WEEK, AND A MONTH AT A TIME
|--------------------------------------------------------------------------
*/

const DAY_STYLE: Record<DayInfo["kind"], { cell: string; swatch: string; word: string }> = {
  verified: { cell: "border-psu-200 bg-psu-50 text-psu-800", swatch: "border-psu-200 bg-psu-50", word: "Verified" },
  pending: { cell: "border-dashed border-psu-300 bg-white", swatch: "border-dashed border-psu-300 bg-white", word: "To verify" },
  open: { cell: "border-gold-300 bg-gold-50", swatch: "border-gold-300 bg-gold-50", word: "Timed in" },
  rejected: { cell: "border-red-300 bg-red-50 text-red-700", swatch: "border-red-300 bg-red-50", word: "Rejected" },
  absent: { cell: "border-amber-200 bg-amber-50 text-amber-800", swatch: "border-amber-200 bg-amber-50", word: "Absent" },
  unexcused: { cell: "border-red-300 bg-red-50 text-red-700", swatch: "border-red-300 bg-red-50", word: "Unexcused" },
  missed: { cell: "border-dashed border-red-300 bg-white text-red-700", swatch: "border-dashed border-red-300 bg-white", word: "No time-in" },
  holiday: { cell: "border-slate-200 bg-[repeating-linear-gradient(135deg,var(--color-slate-100)_0_6px,var(--color-slate-50)_6px_12px)]", swatch: "border-slate-200 bg-slate-100", word: "Holiday" },
  planned: { cell: "border-dashed border-psu-200 bg-transparent text-psu-700", swatch: "border-dashed border-psu-200 bg-transparent", word: "Planned" },
  off: { cell: "border-transparent bg-transparent", swatch: "", word: "" },
};

const barFill = (status: string, open: boolean) =>
  open ? "var(--color-gold-400)" : status === "Verified" ? "var(--color-psu-600)" : status === "Rejected" ? "var(--color-red-300)" : "var(--color-psu-300)";

function WeekByWeek(props: Props) {
  const { data, weeks, state, setState } = props;
  if (weeks.length === 0) {
    return (
      <section aria-labelledby="weeks-h">
        <BlockHead id="weeks-h" title="Week by week" description="Weeks appear here as the student times in." />
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
          <EmptyState icon="clock" title="Nothing to show yet" description="The first time-in starts the first week." />
        </div>
      </section>
    );
  }
  const current = weeks.find((week) => week.start === state.week) ?? weeks.find((week) => week.now) ?? weeks.filter((week) => !week.future).at(-1) ?? weeks[0];
  const month = state.month ?? monthOf(state.day ?? current.start);
  const months: string[] = [];
  for (let key = `${monthOf(weeks[0].start)}-01`; monthOf(key) <= monthOf(weeks.at(-1)!.end); key = addDays(key, 32).slice(0, 8) + "01") months.push(monthOf(key));
  const counts = (m: string) => {
    const inM = (value: string | null | undefined) => !!value && monthOf(dateKey(value)) === m;
    return {
      logs: data.attendance.filter((log) => inM(log.date)).length,
      tasks: data.tasks.filter((task) => inM(task.due_date)).length,
      docs: data.documents.filter((doc) => inM(phDateKey(doc.uploaded_at))).length,
    };
  };
  const selectedMonth = state.view === "month" ? month : monthOf(current.start);

  return (
    <section aria-labelledby="weeks-h">
      <BlockHead
        id="weeks-h"
        title="Week by week"
        description={state.view === "month" ? "Every day of the month at a glance. Pick a day to see its full shift." : "Pick a week, then open any day to see its full shift."}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="View" className="inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-[3px]">
              {(["weeks", "month"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={state.view === view}
                  onClick={() => setState({ view, month: view === "month" ? monthOf(state.day ?? current.start) : state.month })}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium pointer-coarse:h-10 ${state.view === view ? "bg-psu-50 text-psu-900 ring-1 ring-inset ring-psu-600/15" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  <Icon name={view === "weeks" ? "grid" : "calendar"} size={15} />
                  {view === "weeks" ? "Weeks" : "Month"}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Jump to a month" className="flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none]">
              {months.map((m) => {
                const c = counts(m);
                const n = c.logs + c.tasks + c.docs;
                const on = m === selectedMonth;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    title={`${c.logs} time-ins, ${c.tasks} tasks due, ${c.docs} documents`}
                    onClick={() => {
                      const firstWeek = weeks.find((week) => monthOf(week.start) === m || monthOf(week.end) === m);
                      setState({ month: m, day: null, week: firstWeek?.start ?? state.week });
                    }}
                    className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium pointer-coarse:h-10 ${on ? "border-transparent bg-linear-to-br from-[#1a237e] to-[#121a5e] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    {formatPhDay(`${m}-01`, { month: "short" })}
                    {n > 0 && <sup className="tabular inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-gold-400 px-1.5 text-[10.5px] font-bold text-psu-950">{n}</sup>}
                  </button>
                );
              })}
            </div>
          </div>
        }
      />
      {state.view === "month" ? <MonthView {...props} month={month} months={months} /> : <WeeksView {...props} current={current} />}
    </section>
  );
}

function BlockHead({ id, title, description, action }: { id: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2.5">
      <div>
        <h2 id={id} className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

function Spark({ week, ctx }: { week: Week; ctx: RecordContext }) {
  const days = [0, 1, 2, 3, 4].map((offset) => dayInfo(ctx, addDays(week.start, offset)));
  return (
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true" className="block h-[26px] w-full">
      {days.map((day, index) => {
        const x = 2 + index * 20;
        const planned = day.shift?.hours ?? 0;
        const height = (hours: number) => Math.max(2, (hours / 9) * 24);
        return (
          <g key={day.date}>
            {planned > 0 && <rect x={x} y={26 - height(planned)} width={16} height={height(planned)} rx={2} fill="var(--color-psu-50)" />}
            {day.log && (
              <rect
                x={x}
                y={26 - (isOpenLog(day.log) ? 4 : height(Number(day.log.hours) || 0))}
                width={16}
                height={isOpenLog(day.log) ? 4 : height(Number(day.log.hours) || 0)}
                rx={2}
                fill={barFill(day.log.status, isOpenLog(day.log))}
              />
            )}
            {day.absence && <rect x={x} y={22} width={16} height={4} rx={2} fill="var(--color-red-500)" />}
          </g>
        );
      })}
    </svg>
  );
}

function WeeksView(props: Props & { current: Week }) {
  const { data, ctx, weeks, current, setState } = props;
  const required = data.student.required_hours;
  return (
    <>
      <p className="mb-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1 w-6 overflow-hidden rounded-full bg-slate-100"><span className="block h-full w-3/5 bg-psu-600" /></span>
          Share of {formatHours(required)} verified by the end of each week
        </span>
        <span className="rounded-full bg-gold-50 px-2 text-[10.5px] font-bold text-gold-700 ring-1 ring-inset ring-gold-600/25">This week</span>
      </p>
      <div role="group" aria-label="Weeks" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-3 pt-1">
        {weeks.map((week) => {
          const status = weekStatus(week);
          const pct = required > 0 ? Math.min(100, ((week.future ? week.proj : week.cum) / required) * 100) : 0;
          const on = week.start === current.start;
          return (
            <button
              key={week.start}
              type="button"
              aria-pressed={on}
              aria-label={`Week ${week.n}, ${weekRange(week.start)}: ${status.text}`}
              onClick={() => setState({ week: week.start, day: ctx.today >= week.start && ctx.today <= week.end ? ctx.today : null })}
              className={`flex w-[164px] shrink-0 snap-start flex-col gap-[3px] rounded-[14px] border px-3 py-2.5 text-left transition-shadow ${
                week.future ? "border-dashed border-slate-200 bg-transparent" : "border-slate-200 bg-white hover:border-psu-200 hover:shadow-card"
              } ${on ? "border-psu-600! shadow-raised ring-[3px] ring-psu-500/15" : ""}`}
            >
              <span className={`flex items-center justify-between gap-1.5 text-[13.5px] font-bold ${week.future ? "text-slate-500" : "text-slate-900"}`}>
                Week {week.n}
                {week.now && <span className="rounded-full bg-gold-50 px-1.5 text-[10.5px] font-bold text-gold-700 ring-1 ring-inset ring-gold-600/25">This week</span>}
              </span>
              <span className="text-[11.5px] text-slate-500">{weekRange(week.start)}</span>
              {week.future ? <span className="h-[26px] rounded-md bg-[repeating-linear-gradient(90deg,var(--color-psu-50)_0_16px,transparent_16px_20px)]" /> : <Spark week={week} ctx={ctx} />}
              <span className="flex items-baseline justify-between text-xs text-slate-500">
                {week.future ? "Planned" : "Verified"}
                <b className="tabular text-[15px] font-semibold text-slate-900">{formatHours(week.future ? week.planned : week.verified)}</b>
              </span>
              <span className={`truncate text-[11.5px] font-semibold ${TONE_TEXT[status.tone]}`}>{status.text}</span>
              <span
                className="mt-0.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-500"
                title={week.future ? `About ${oneDecimal(week.proj)} of ${required} h by the end of this week, if the schedule is kept` : `${oneDecimal(week.cum)} of ${required} h verified by the end of this week`}
              >
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className={`block h-full rounded-full ${week.future ? "bg-[repeating-linear-gradient(90deg,var(--color-psu-300)_0_4px,transparent_4px_7px)]" : "bg-linear-to-r from-psu-500 to-psu-700"}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="tabular">{week.future ? "~" : ""}{Math.round(pct)}%</span>
              </span>
            </button>
          );
        })}
      </div>
      <WeekDetail {...props} week={current} />
    </>
  );
}

const FILTERS = [
  ["time", "Time-ins"],
  ["absences", "Absences"],
  ["tasks", "Tasks"],
  ["reports", "Weekly report"],
  ["docs", "Documents"],
  ["evals", "Evaluations"],
] as const;

function WeekDetail(props: Props & { week: Week }) {
  const { ctx, weeks, week, state, setState, onOpen } = props;
  const index = weeks.indexOf(week);
  const prev = weeks[index - 1];
  const next = weeks[index + 1];
  const shown = (key: string) => !state.hidden.includes(key);
  const days = Array.from({ length: 7 }, (_, offset) => dayInfo(ctx, addDays(week.start, offset)));
  const counted = days.filter((day) => day.shift && day.kind !== "off" && day.kind !== "holiday" && (!week.now || day.date <= ctx.today));
  const closed = days.filter((day) => day.shift && day.kind !== "off" && day.kind !== "holiday" && (!week.now || day.date < ctx.today));
  const closedLogged = week.logs.filter((log) => !week.now || dateKey(log.date) < ctx.today).reduce((sum, log) => sum + (Number(log.hours) || 0), 0);
  const diff = Math.round((closedLogged - closed.reduce((sum, day) => sum + (day.shift?.hours ?? 0), 0)) * 10) / 10;
  const counts: Record<string, number> = { time: week.logs.length, absences: week.absences.length, tasks: week.tasks.length, reports: week.report ? 1 : 0, docs: week.docs.length, evals: week.evals.length };
  const pill = (tone: string, text: string) => <span key={text} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{text}</span>;
  const pills = week.future
    ? []
    : [
        pill("bg-slate-100 text-slate-700", `${week.logs.length} of ${counted.length} days worked`),
        week.issues.late ? pill("bg-amber-50 text-amber-800", `${week.issues.late} late`) : null,
        week.issues.pending ? pill("bg-amber-50 text-amber-800", `${week.issues.pending} to verify`) : null,
        week.issues.rejected ? pill("bg-red-50 text-red-700", `${week.issues.rejected} rejected`) : null,
        week.absences.length ? pill(week.issues.absPending ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700", plural(week.absences.length, "absence", "absences")) : null,
        week.holidays.length ? pill("bg-slate-100 text-slate-700", plural(week.holidays.length, "holiday", "holidays")) : null,
      ];

  return (
    <section aria-live="polite" className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-[17px] font-bold text-slate-900">Week {week.n} · {weekRange(week.start)}</h3>
          <p className="text-xs text-slate-500">
            {week.future ? `Planned ${formatHours(week.planned)}` : `${formatHours(week.verified)} verified of ${formatHours(week.logged)} logged · ${formatHours(week.planned)} scheduled`}
            {week.now && " · this week so far"}
          </p>
          {pills.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{pills}</div>}
        </div>
        <div className="flex gap-1.5">
          <RoundButton label="Previous week" icon="chevron-left" disabled={!prev} onClick={() => prev && setState({ week: prev.start, day: null })} />
          <RoundButton label="Next week" icon="chevron-right" disabled={!next} onClick={() => next && setState({ week: next.start, day: null })} />
        </div>
      </div>

      {!week.future && (
        <div role="group" aria-label="Show in this week" className="flex flex-wrap items-center gap-1.5 px-4 pt-3 sm:px-5">
          <span className="mr-0.5 inline-flex items-center gap-1.5 text-[12.5px] text-slate-500"><Icon name="sliders" size={15} />Show</span>
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={shown(key)}
              onClick={() => setState({ hidden: shown(key) ? [...state.hidden, key] : state.hidden.filter((item) => item !== key) })}
              className={`inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] pointer-coarse:h-10 ${shown(key) ? "border-psu-200 bg-psu-50 font-medium text-psu-900" : "border-slate-200 text-slate-500"}`}
            >
              {shown(key) && <Icon name="check" size={12} />}
              {label}
              <span className="tabular text-[11px] text-slate-500">{counts[key]}</span>
            </button>
          ))}
        </div>
      )}

      <div className={`grid gap-4 p-4 sm:p-5 ${week.future ? "" : "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"}`}>
        <div className="flex min-w-0 flex-col gap-3.5">
          {!week.future && shown("time") && (week.logs.length > 0 || week.absences.length > 0) && (
            <SubCard icon="clock" title="Hours">
              <HoursChart {...props} week={week} />
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[12.5px] text-slate-500">
                <span>Verified <b className="tabular text-lg font-semibold text-slate-900">{formatHours(week.verified)}</b></span>
                <span className={`tabular font-semibold ${diff > 0 ? "text-emerald-700" : diff < 0 ? "text-red-700" : "text-slate-500"}`}>
                  {Math.abs(diff) < 0.05 ? "On schedule" : `${diff > 0 ? "+" : "−"}${oneDecimal(Math.abs(diff))} h vs schedule`}
                  {week.now && " so far"}
                </span>
              </div>
              <Legend
                items={[
                  ["var(--color-psu-600)", "Verified"],
                  ["var(--color-psu-300)", "Awaiting review"],
                  ["var(--color-red-300)", "Rejected"],
                ]}
                extra="Select a bar to open that day"
              />
            </SubCard>
          )}
          <SubCard
            icon="calendar"
            title="Day by day"
            action={
              <button type="button" onClick={() => onOpen({ kind: "open", tab: "attendance", label: "Time logs", logFilter: "all" })} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-semibold text-psu-700 hover:bg-psu-50">
                Time logs <Icon name="chevron-right" size={13} />
              </button>
            }
          >
            <DayList {...props} week={week} days={days} />
          </SubCard>
        </div>
        {!week.future && <WeekSide {...props} week={week} />}
      </div>
    </section>
  );
}

function WeekSide({ week, state, onOpen }: Props & { week: Week }) {
  const shown = (key: string) => !state.hidden.includes(key);
  const link = (label: string, action: Extract<AttentionAction, { kind: "open" }>) => (
    <button type="button" onClick={() => onOpen(action)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-semibold text-psu-700 hover:bg-psu-50">
      {label} <Icon name="chevron-right" size={13} />
    </button>
  );
  const parts: ReactNode[] = [];
  if (shown("tasks") && week.tasks.length)
    parts.push(
      <SubCard key="tasks" icon="tasks" title="Tasks due" action={link("Open", { kind: "open", tab: "tasks", label: "Tasks" })}>
        <ul className="space-y-2">
          {week.tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-2.5 text-[13px] text-slate-700">
              <span className="truncate">{task.title}</span>
              {task.review_rating ? <Stars value={task.review_rating} size={13} /> : <StatusBadge status={taskLabel(task.status)} tone={taskTone(task.status)} />}
            </li>
          ))}
        </ul>
      </SubCard>
    );
  if (shown("reports")) {
    if (week.report)
      parts.push(
        <SubCard key="report" icon="note" title="Weekly report" action={link("Read", { kind: "open", tab: "journals", label: "Read", report: week.start })}>
          <StatusBadge status={reportLabel(week.report.status)} tone={reportTone(week.report.status)} />
          <p className="mt-1.5 line-clamp-3 text-[13px] text-slate-600">{week.report.activities}</p>
        </SubCard>
      );
    else if (week.logs.length && !week.now)
      parts.push(
        <SubCard key="report" icon="note" title="Weekly report" action={link("Open", { kind: "open", tab: "journals", label: "Weekly reports" })}>
          <p className="text-[13px] text-slate-600">Not written for this week.</p>
        </SubCard>
      );
  }
  if (shown("docs") && week.docs.length)
    parts.push(
      <SubCard key="docs" icon="document" title="Documents uploaded" action={link("Open", { kind: "open", tab: "documents", label: "Documents" })}>
        <ul className="space-y-2">
          {week.docs.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-2.5 text-[13px] text-slate-700">
              <span className="truncate">{doc.doc_type}</span>
              <StatusBadge status={doc.status === "Pending" ? "Awaiting review" : doc.status} tone={doc.status === "Pending" ? "waiting" : undefined} />
            </li>
          ))}
        </ul>
      </SubCard>
    );
  if (shown("evals") && week.evals.length)
    parts.push(
      <SubCard key="evals" icon="star" title="Ratings given" action={link("Open", { kind: "open", tab: "evaluations", label: "Evaluations" })}>
        <ul className="space-y-2">
          {week.evals.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2.5 text-[13px] text-slate-700">
              <span className="truncate">{item.category}</span>
              <Stars value={item.rating} size={13} />
            </li>
          ))}
        </ul>
      </SubCard>
    );
  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      {parts.length ? parts : <p className="rounded-xl border border-dashed border-slate-200 p-3.5 text-center text-[13px] text-slate-500">No tasks, reports, documents or ratings this week.</p>}
    </div>
  );
}

function SubCard({ icon, title, action, children }: { icon: IconName; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2.5 px-3.5 pt-3">
        <h4 className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900">
          <Icon name={icon} size={15} className="text-psu-700" />
          {title}
        </h4>
        {action}
      </div>
      <div className="px-3.5 pb-3 pt-2">{children}</div>
    </div>
  );
}

function RoundButton({ label, icon, disabled, onClick }: { label: string; icon: IconName; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 hover:border-psu-200 hover:text-psu-700 disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11"
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

function Legend({ items, extra }: { items: [string, string][]; extra?: string }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
      {items.map(([color, label]) => (
        <span key={label} className="inline-flex items-center gap-1">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
      {extra && <span>{extra}</span>}
    </div>
  );
}

function HoursChart({ ctx, week, state, setState }: Props & { week: Week }) {
  const days = [0, 1, 2, 3, 4].map((offset) => dayInfo(ctx, addDays(week.start, offset)));
  const W = 420, H = 112, top = 16, base = H - 22, max = 9, x0 = 26, colW = (W - x0 - 6) / 5, bw = 34;
  const y = (hours: number) => base - (Math.min(hours, max) / max) * (base - top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Hours logged each day of week ${week.n}, against the schedule. Select a day to open it.`}>
      {days.map((day, index) => state.day === day.date && <rect key={`sel-${day.date}`} x={x0 + colW * index + 3} y={4} width={colW - 6} height={H - 6} rx={9} fill="var(--color-psu-50)" stroke="var(--color-psu-200)" />)}
      {[4, 8].map((grid) => (
        <g key={grid}>
          <line x1={x0} x2={W - 4} y1={y(grid)} y2={y(grid)} stroke="var(--color-slate-200)" />
          <text x={x0 - 6} y={y(grid) + 3} textAnchor="end" fontSize={10} fill="var(--color-slate-400)">{grid} h</text>
        </g>
      ))}
      {days.map((day, index) => {
        const cx = x0 + colW * index + colW / 2;
        const x = cx - bw / 2;
        const planned = day.shift?.hours ?? 0;
        const log = day.log;
        const bold = day.date === ctx.today || state.day === day.date;
        return (
          <g key={day.date}>
            {planned > 0 && <rect x={x} y={y(planned)} width={bw} height={base - y(planned)} rx={5} fill="white" stroke="var(--color-psu-200)" strokeDasharray="3 2" />}
            {log && !isOpenLog(log) && (
              <>
                <rect x={x} y={y(Number(log.hours) || 0)} width={bw} height={Math.max(2, base - y(Number(log.hours) || 0))} rx={5} fill={barFill(log.status, false)} />
                <text x={cx} y={y(Math.max(Number(log.hours) || 0, planned)) - 5} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--color-slate-700)">{oneDecimal(Number(log.hours) || 0)}</text>
              </>
            )}
            {log && isOpenLog(log) && (
              <>
                <rect x={x} y={base - 12} width={bw} height={12} rx={4} fill="var(--color-gold-400)" />
                <text x={cx} y={base - 17} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-gold-700)">in progress</text>
              </>
            )}
            {!log && day.absence && <text x={cx} y={base - 8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--color-red-600)">Absent</text>}
            {!log && !day.absence && day.kind === "holiday" && <text x={cx} y={base - 8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--color-slate-400)">Holiday</text>}
            <text x={cx} y={H - 5} textAnchor="middle" fontSize={11} fontWeight={bold ? 700 : 400} fill={bold ? "var(--color-psu-700)" : "var(--color-slate-500)"}>
              {formatDayDate(day.date).replace(/, [A-Za-z]+ /, " ")}
            </text>
          </g>
        );
      })}
      <line x1={x0} x2={W - 4} y1={base} y2={base} stroke="var(--color-slate-300)" />
      {days.map((day, index) => (
        <rect
          key={`hit-${day.date}`}
          x={x0 + colW * index}
          y={0}
          width={colW}
          height={H}
          fill="transparent"
          className="cursor-pointer hover:fill-psu-600/5"
          onClick={() => setState({ day: state.day === day.date ? null : day.date })}
        >
          <title>{`${formatDayDate(day.date)}: open this day`}</title>
        </rect>
      ))}
    </svg>
  );
}

function DayList(props: Props & { week: Week; days: DayInfo[] }) {
  const { days, state, setState } = props;
  const shown = (key: string) => !state.hidden.includes(key);
  const rows = days.filter((day) => day.kind !== "off" && (day.absence ? shown("absences") : shown("time")));
  if (rows.length === 0) return <p className="rounded-xl border border-dashed border-slate-200 p-3.5 text-center text-[13px] text-slate-500">No scheduled days this week.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((day) => {
        const open = state.day === day.date;
        const { log, absence, holiday, shift } = day;
        let summary: ReactNode;
        let hours: ReactNode = "—";
        if (log) {
          const inAt = minutesOf(log.time_in);
          const outAt = minutesOf(log.time_out);
          summary = (
            <>
              <span className="tabular">{inAt !== null ? minutesLabel(inAt) : "—"} – {isOpenLog(log) ? "still in" : outAt !== null ? minutesLabel(outAt) : "—"}</span>
              <StatusBadge status={isOpenLog(log) ? "Open" : log.status === "Pending" ? "To verify" : log.status} tone={isOpenLog(log) ? "info" : log.status === "Pending" ? "waiting" : undefined} />
              {day.lateMinutes > 0 && <span className="rounded-md bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-800">{day.lateMinutes} min late</span>}
              {log.time_corrected_at && <span className="rounded-md bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600">Corrected</span>}
            </>
          );
          hours = isOpenLog(log) ? "—" : formatHours(log.hours);
        } else if (absence) {
          summary = (
            <>
              Absent{" "}
              <StatusBadge status={absence.status === "Pending" ? "To decide" : absence.status} tone={absence.status === "Excused" ? "good" : absence.status === "Unexcused" ? "bad" : "waiting"} />
            </>
          );
        } else if (day.kind === "holiday") summary = <span className="text-slate-500">Holiday · {holiday?.name}</span>;
        else if (day.kind === "missed") summary = <span className="text-red-700">No time-in on a scheduled day</span>;
        else if (shift) {
          summary = <span className="text-slate-500">Scheduled {minutesLabel(clockMinutes(shift.start))} – {minutesLabel(clockMinutes(shift.end))}</span>;
          hours = <span className="text-xs text-slate-500">{formatHours(shift.hours)}</span>;
        }
        return (
          <li key={day.date}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`day-${day.date}`}
              onClick={() => setState({ day: open ? null : day.date })}
              className={`grid w-full grid-cols-[56px_minmax(0,1fr)_46px_16px] items-center gap-x-2.5 gap-y-1 px-1 py-2.5 text-left hover:bg-slate-50 sm:grid-cols-[74px_minmax(0,1fr)_58px_18px] pointer-coarse:py-3 ${open ? "rounded-t-xl bg-psu-50 hover:bg-psu-50" : "rounded-lg"}`}
            >
              <span>
                <b className="block text-[13px] font-semibold text-slate-900">{WEEKDAYS[weekdayOf(day.date)].slice(0, 3)}</b>
                <span className="text-[11.5px] text-slate-500">{formatDayDate(day.date).replace(/^[A-Za-z]+, /, "")}</span>
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-700">{summary}</span>
              <span className="tabular text-right text-[13px] font-semibold text-slate-900">{hours}</span>
              <Icon name="chevron-down" size={15} className={`transition-transform ${open ? "rotate-180 text-psu-700" : "text-slate-400"}`} />
            </button>
            {open && (
              <div id={`day-${day.date}`} className="mb-2 animate-page-in rounded-b-xl border border-t-0 border-psu-100 bg-white p-3">
                <DayDetail {...props} info={day} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The shift on a time line: scheduled hours dashed, time worked on top, the break cut out, lateness marked. */
function ShiftBar({ info, loadedAt }: { info: DayInfo; loadedAt: Date }) {
  const id = useId().replace(/:/g, "");
  const { log, shift } = info;
  const open = !!log && isOpenLog(log);
  const s0 = shift ? clockMinutes(shift.start) : null;
  const s1 = shift ? clockMinutes(shift.end) : null;
  const inAt = log ? minutesOf(log.time_in) : null;
  const nowAt = loadedAt.getHours() * 60 + loadedAt.getMinutes();
  const outAt = log ? (open ? (inAt !== null ? Math.min(Math.max(inAt + 20, nowAt), 20 * 60) : null) : minutesOf(log.time_out)) : null;
  const breakAt = log ? minutesOf(log.break_time) : null;
  const backAt = log ? minutesOf(log.break_end_time) : null;
  const points = [s0, s1, inAt, outAt].filter((value): value is number => value !== null);
  if (points.length === 0) return null;
  const a = Math.floor((Math.min(...points) - 20) / 60) * 60;
  const b = Math.ceil((Math.max(...points) + 20) / 60) * 60;
  const W = 560, H = 74, px = 14, y0 = 22, bh = 20;
  const x = (m: number) => px + ((m - a) / (b - a)) * (W - 2 * px);
  const step = b - a > 360 ? 120 : 60;
  const hourText = (m: number) => `${Math.floor(m / 60) % 12 || 12} ${m < 720 ? "AM" : "PM"}`;
  const ticks: number[] = [];
  for (let m = a; m <= b; m += 60) ticks.push(m);
  const fill = open ? `url(#open-${id})` : barFill(log?.status ?? "", false);
  const label = log
    ? `Timed in ${inAt !== null ? minutesLabel(inAt) : "unknown"}, ${open ? "not yet timed out" : `timed out ${outAt !== null ? minutesLabel(outAt) : "unknown"}`}${s0 !== null && s1 !== null ? `; scheduled ${minutesLabel(s0)} to ${minutesLabel(s1)}` : ""}`
    : s0 !== null && s1 !== null ? `Scheduled ${minutesLabel(s0)} to ${minutesLabel(s1)}` : "";
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[720px]" role="img" aria-label={label}>
        <defs>
          <pattern id={`hatch-${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="white" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-slate-300)" strokeWidth="2" />
          </pattern>
          <linearGradient id={`open-${id}`} x1="0" x2="1">
            <stop offset=".6" stopColor="var(--color-gold-400)" />
            <stop offset="1" stopColor="var(--color-gold-400)" stopOpacity=".15" />
          </linearGradient>
        </defs>
        {ticks.map((m) => (
          <g key={m}>
            <line x1={x(m)} x2={x(m)} y1={y0 - 6} y2={y0 + bh + 4} stroke="var(--color-slate-100)" />
            {(m - a) % step === 0 && <text x={x(m)} y={10} textAnchor="middle" fontSize={10} fill="var(--color-slate-400)">{hourText(m)}</text>}
          </g>
        ))}
        {s0 !== null && s1 !== null && <rect x={x(s0)} y={y0 - 5} width={x(s1) - x(s0)} height={bh + 10} rx={7} fill="var(--color-psu-50)" stroke="var(--color-psu-300)" strokeDasharray="4 3" />}
        {log && inAt !== null && outAt !== null && (
          <>
            <rect x={x(inAt)} y={y0} width={Math.max(3, x(outAt) - x(inAt))} height={bh} rx={5} fill={fill} />
            {breakAt !== null && backAt !== null && backAt > breakAt && (
              <>
                <rect x={x(breakAt)} y={y0} width={x(backAt) - x(breakAt)} height={bh} fill={`url(#hatch-${id})`} />
                <text x={(x(breakAt) + x(backAt)) / 2} y={y0 + 14} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="var(--color-slate-500)">break</text>
              </>
            )}
            {info.lateMinutes > 0 && s0 !== null && (
              <>
                <rect x={x(s0)} y={y0 + bh / 2 - 2} width={x(inAt) - x(s0)} height={4} rx={2} fill="var(--color-amber-500)" />
                <text x={(x(s0) + x(inAt)) / 2} y={y0 - 8} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--color-amber-700)">+{info.lateMinutes} min</text>
              </>
            )}
            <text x={x(inAt)} y={y0 + bh + 17} fontSize={11} fontWeight={600} fill="var(--color-slate-700)">{minutesLabel(inAt)}</text>
            <text x={x(outAt)} y={y0 + bh + 17} textAnchor="end" fontSize={11} fontWeight={600} fill={open ? "var(--color-gold-700)" : "var(--color-slate-700)"}>
              {open ? "still in" : minutesLabel(outAt)}
            </text>
          </>
        )}
        {!log && s0 !== null && s1 !== null && (
          <text x={(x(s0) + x(s1)) / 2} y={y0 + 14} textAnchor="middle" fontSize={10.5} fill="var(--color-psu-700)">{minutesLabel(s0)} – {minutesLabel(s1)}</text>
        )}
      </svg>
      <div className="mb-2.5 mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
        {shift && <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-psu-300 bg-psu-50" />Scheduled</span>}
        {log && (
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: barFill(log.status, open) }} />
            {open ? "Timed in" : log.status === "Pending" ? "Worked, awaiting review" : `Worked, ${log.status.toLowerCase()}`}
          </span>
        )}
        {breakAt !== null && <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[repeating-linear-gradient(45deg,var(--color-slate-300)_0_2px,white_2px_5px)]" />Break</span>}
        {info.lateMinutes > 0 && <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />Late</span>}
      </div>
    </>
  );
}

/** Everything about one day: for the open row of a week, or the day picked in the calendar. */
function DayDetail(props: Props & { info: DayInfo }) {
  const { info, perf, canDecide, online, onApprove, onReject, onOpen, data, loadedAt } = props;
  const { log, absence, holiday, shift } = info;
  const message = (tone: "waiting" | "bad" | "good" | "info" | "muted", icon: IconName, title: string, text?: ReactNode, extra?: ReactNode) => {
    const tones = {
      waiting: "bg-amber-50 [&_.ic]:text-amber-700",
      bad: "bg-red-50 [&_.ic]:text-red-600",
      good: "bg-emerald-50 [&_.ic]:text-emerald-700",
      info: "bg-psu-50 [&_.ic]:text-psu-700",
      muted: "bg-slate-50 [&_.ic]:text-slate-500",
    }[tone];
    return (
      <div className={`flex items-start gap-3 rounded-xl p-3 ${tones}`}>
        <span className="ic grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-white"><Icon name={icon} size={15} /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {text && <p className="mt-0.5 text-[13px] text-slate-600">{text}</p>}
          {extra}
        </div>
      </div>
    );
  };

  if (log) {
    const open = isOpenLog(log);
    const inAt = minutesOf(log.time_in);
    const outAt = minutesOf(log.time_out);
    const breakAt = minutesOf(log.break_time);
    const backAt = minutesOf(log.break_end_time);
    const facts: [string, ReactNode][] = [
      ["Time in", <>{inAt !== null ? minutesLabel(inAt) : "—"}{info.lateMinutes > 0 && <span className="rounded-md bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-800">{info.lateMinutes} min late</span>}</>],
      ["Break", breakAt !== null ? `${minutesLabel(breakAt)} – ${backAt !== null ? minutesLabel(backAt) : "not back yet"}` : "No break"],
      ["Time out", open ? <span className="font-normal text-slate-600">Not yet</span> : <>{outAt !== null ? minutesLabel(outAt) : "—"}{log.time_corrected_at && <span className="rounded-md bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600">Corrected</span>}</>],
      ["Hours", open ? "—" : <>{formatHours(log.hours)}{shift && <span className="text-xs font-normal text-slate-500">of {formatHours(shift.hours)}</span>}</>],
      ["Status", <StatusBadge status={open ? "Open" : log.status === "Pending" ? "Awaiting review" : log.status} tone={open ? "info" : log.status === "Pending" ? "waiting" : undefined} />],
    ];
    return (
      <>
        <ShiftBar info={info} loadedAt={loadedAt} />
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-[10px] bg-slate-50 px-2.5 py-2">
              <dt className="text-[11.5px] text-slate-500">{label}</dt>
              <dd className="tabular mt-0.5 flex flex-wrap items-center gap-1 text-[13.5px] font-semibold text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
          <DaySection label="What was done">
            {log.accomplishments ? log.accomplishments : <span className="text-slate-500">{open ? "Written at time-out." : "Nothing was written at time-out."}</span>}
          </DaySection>
          {log.tasks && log.tasks.length > 0 && (
            <DaySection label="Tasks worked on">
              <span className="mt-1 flex flex-wrap gap-1.5">
                {log.tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpen({ kind: "open", tab: "tasks", label: "Tasks", taskFilter: "all" })}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-psu-200 bg-psu-50 px-2.5 text-[12.5px] font-medium text-psu-900 hover:bg-psu-100"
                  >
                    <Icon name="tasks" size={12} />
                    {task.title}
                  </button>
                ))}
              </span>
            </DaySection>
          )}
          {log.note && <DaySection label="Student's note">{log.note}</DaySection>}
          {log.review_notes && <DaySection label="Reviewer" tone="bad">{log.review_notes}</DaySection>}
        </div>
        <div className="mt-2.5 flex justify-end">
          <button type="button" onClick={() => onOpen({ kind: "open", tab: "attendance", label: "Time logs", logFilter: "all" })} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-semibold text-psu-700 hover:bg-psu-50">
            Open in Time logs <Icon name="chevron-right" size={13} />
          </button>
        </div>
      </>
    );
  }
  if (absence) {
    const pending: Pending = { kind: "absence", id: absence.id, label: `Absence on ${formatDayDate(info.date)}` };
    return (
      <>
        {message(
          absence.status === "Excused" ? "good" : absence.status === "Unexcused" ? "bad" : "waiting",
          "ban",
          absence.status === "Pending" ? "Absent, waiting for a decision" : `Absent · ${absence.status}`,
          absence.reason,
          absence.review_notes ? <p className="mt-1 text-xs text-slate-500">Note: {absence.review_notes}</p> : undefined
        )}
        {absence.status === "Pending" && (
          <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
            {canDecide ? (
              <DecideButtons approveLabel="Excuse" rejectLabel="Unexcused" onApprove={() => onApprove(pending)} onReject={() => onReject(pending)} online={online} />
            ) : (
              <span className="text-xs text-slate-500">Waiting for {data.student.supervisor_name || "the supervisor"} to decide.</span>
            )}
          </div>
        )}
      </>
    );
  }
  if (info.kind === "holiday") return message("muted", "calendar", `Holiday · ${holiday?.name ?? ""}`, "Nobody was expected to report.");
  if (info.kind === "missed")
    return (
      <>
        <ShiftBar info={info} loadedAt={loadedAt} />
        {message(
          "bad",
          "alert",
          "No time-in on a scheduled day",
          `No absence was filed. It counts against attendance on scheduled days${perf ? ` (${perf.performance.attendance.attended_days} of ${perf.performance.attendance.scheduled_days} so far)` : ""}.`
        )}
      </>
    );
  if (info.kind === "planned" && shift)
    return (
      <>
        <ShiftBar info={info} loadedAt={loadedAt} />
        {message("info", "calendar", `Scheduled ${minutesLabel(clockMinutes(shift.start))} – ${minutesLabel(clockMinutes(shift.end))} · ${formatHours(shift.hours)}`, shift.focus || undefined)}
      </>
    );
  return message("muted", "calendar", "No OJT this day", shift ? "Outside the placement dates." : `${WEEKDAYS[weekdayOf(info.date)]} is not on the weekly schedule.`);
}

function DaySection({ label, tone, children }: { label: string; tone?: "bad"; children: ReactNode }) {
  return (
    <div className={tone === "bad" ? "rounded-[10px] bg-red-50 px-2.5 py-2" : ""}>
      <p className={`text-[11.5px] font-bold uppercase tracking-wider ${tone === "bad" ? "text-red-700" : "text-slate-500"}`}>{label}</p>
      <div className="mt-0.5 whitespace-pre-line break-words text-[13.5px] text-slate-800">{children}</div>
    </div>
  );
}

function MonthView(props: Props & { month: string; months: string[] }) {
  const { ctx, weeks, month, months, state, setState } = props;
  const [year, monthIndex] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  const cells: string[] = [];
  for (let key = mondayOf(first); !(key > last && weekdayOf(key) === 1); key = addDays(key, 1)) cells.push(key);
  const inMonth = (key: string) => monthOf(key) === month;
  const infos = cells.filter(inMonth).map((key) => dayInfo(ctx, key));
  const logged = infos.filter((day) => day.log);
  const verified = logged.filter((day) => day.log?.status === "Verified").reduce((sum, day) => sum + (Number(day.log?.hours) || 0), 0);
  const index = months.indexOf(month);
  const shiftMonth = (by: number) => {
    const next = months[index + by];
    if (next) setState({ month: next, day: null });
  };
  const picked = state.day && inMonth(state.day) ? state.day : null;
  const stat = (value: ReactNode, label: string, tone = "") => (
    <span className={`inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-0.5 text-xs text-slate-600 ${tone || "border-slate-200 bg-slate-50"}`}>
      <b className="tabular text-[13px] text-slate-900">{value}</b>
      {label}
    </span>
  );
  const lateDays = infos.filter((day) => day.lateMinutes > 0).length;
  const missed = infos.filter((day) => day.kind === "missed").length;
  const absences = infos.filter((day) => day.absence).length;
  const holidays = infos.filter((day) => day.kind === "holiday").length;

  return (
    <>
      <section className="rounded-2xl border border-slate-200/80 bg-white px-2 py-3 shadow-card sm:px-4 sm:py-4">
        <div className="mb-3 flex flex-wrap items-center gap-2.5 px-1">
          <RoundButton label="Previous month" icon="chevron-left" disabled={index <= 0} onClick={() => shiftMonth(-1)} />
          <h3 className="min-w-[140px] flex-1 text-center text-base font-bold text-slate-900 sm:flex-none">
            {formatPhDay(first, { month: "long", year: "numeric" })}
          </h3>
          <RoundButton label="Next month" icon="chevron-right" disabled={index >= months.length - 1} onClick={() => shiftMonth(1)} />
          <div className="flex w-full flex-wrap gap-1.5 sm:ml-auto sm:w-auto">
            {stat(logged.length, logged.length === 1 ? "day logged" : "days logged")}
            {stat(formatHours(verified), "verified")}
            {stat(lateDays, "late", lateDays ? "border-amber-200 bg-amber-50" : "")}
            {stat(missed, "missed", missed ? "border-red-200 bg-red-50" : "")}
            {stat(absences, absences === 1 ? "absence" : "absences")}
            {stat(holidays, holidays === 1 ? "holiday" : "holidays")}
          </div>
        </div>
        <div className="grid grid-cols-7 gap-[3px] sm:gap-1.5" role="group" aria-label={formatPhDay(first, { month: "long", year: "numeric" })}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
            <div key={name} aria-hidden="true" className="pb-0.5 text-center text-[11.5px] font-semibold text-slate-500">{name}</div>
          ))}
          {cells.map((key) => {
            if (!inMonth(key)) return <div key={key} aria-hidden="true" />;
            const day = dayInfo(ctx, key);
            const style = DAY_STYLE[day.kind];
            const today = key === ctx.today;
            const dayNumber = (
              <span className={`flex items-center gap-1 text-xs font-bold ${day.kind === "off" ? "text-slate-300" : "text-slate-600"}`}>
                {today && <span className="h-[7px] w-[7px] rounded-full bg-gold-400 ring-[3px] ring-gold-400/30" />}
                {Number(key.slice(8))}
                {day.lateMinutes > 0 && <i className="inline-block h-[7px] w-[7px] rounded-full bg-amber-500" title="Late" />}
                {day.log?.time_corrected_at && <i className="inline-block h-[7px] w-[7px] rounded-full bg-slate-400" title="Corrected" />}
              </span>
            );
            if (day.kind === "off") return <div key={key} className="min-h-[54px] rounded-lg p-1 sm:min-h-[78px] sm:p-2">{dayNumber}</div>;
            let main = "";
            let sub = "";
            if (day.log) {
              if (isOpenLog(day.log)) {
                main = "In";
                const at = minutesOf(day.log.time_in);
                sub = at !== null ? minutesLabel(at) : "";
              } else {
                main = formatHours(day.log.hours);
                sub = day.log.status === "Pending" ? "To verify" : day.log.status;
              }
            } else if (day.absence) {
              main = "Absent";
              sub = day.absence.status === "Pending" ? "To decide" : day.absence.status;
            } else if (day.kind === "holiday") {
              main = "Holiday";
              sub = day.holiday?.name ?? "";
            } else if (day.kind === "missed") {
              main = "—";
              sub = "No time-in";
            } else if (day.shift) {
              main = formatHours(day.shift.hours);
              sub = "Planned";
            }
            const fill = day.log && !isOpenLog(day.log) && day.shift ? Math.min(100, ((Number(day.log.hours) || 0) / day.shift.hours) * 100) : null;
            const selected = picked === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                aria-label={`${formatDayDate(key)}: ${main}${sub ? `, ${sub}` : ""}${day.lateMinutes ? `, ${day.lateMinutes} minutes late` : ""}`}
                onClick={() => setState({ day: selected ? null : key, week: weeks.some((week) => week.start === mondayOf(key)) ? mondayOf(key) : state.week })}
                className={`relative flex min-h-[54px] min-w-0 flex-col items-start gap-px overflow-hidden rounded-lg border p-1 pb-2 text-left transition hover:-translate-y-px hover:shadow-raised sm:min-h-[78px] sm:rounded-[10px] sm:px-2 sm:pt-1.5 ${style.cell} ${selected ? "shadow-raised ring-2 ring-psu-600" : ""}`}
              >
                {dayNumber}
                <span className="tabular max-w-full overflow-hidden whitespace-nowrap text-[11px] font-bold leading-tight text-slate-900 sm:text-sm">{main}</span>
                <span className="hidden max-w-full truncate text-[11px] sm:block">{sub}</span>
                {fill !== null && (
                  <span className="absolute inset-x-1 bottom-[3px] h-[3px] overflow-hidden rounded-full bg-white/60 sm:inset-x-2 sm:bottom-[5px]">
                    <span className="block h-full bg-current opacity-55" style={{ width: `${fill}%` }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11.5px] text-slate-500">
          {(["verified", "pending", "open", "rejected", "absent", "missed", "holiday", "planned"] as const).map((kind) => (
            <span key={kind} className="inline-flex items-center gap-1">
              <i className={`inline-block h-3 w-3 rounded border ${DAY_STYLE[kind].swatch}`} />
              {DAY_STYLE[kind].word}
            </span>
          ))}
          <span className="inline-flex items-center gap-1"><i className="inline-block h-[7px] w-[7px] rounded-full bg-amber-500" />Late</span>
        </div>
      </section>
      <section aria-live="polite" className="mt-3 rounded-2xl border border-slate-200/80 bg-white shadow-card">
        {picked ? (
          <>
            <div className="flex items-center justify-between gap-2.5 border-b border-slate-100 px-4 py-3.5 sm:px-5">
              <div>
                <h3 className="text-[15.5px] font-bold text-slate-900">{formatLongDate(picked)}</h3>
                <p className="text-xs text-slate-500">Week {weekNumberOf(weeks, picked) ?? "—"}</p>
              </div>
              <RoundButton label="Close this day" icon="close" onClick={() => setState({ day: null })} />
            </div>
            <div className="p-3 sm:px-5 sm:py-4">
              <DayDetail {...props} info={dayInfo(ctx, picked)} />
            </div>
          </>
        ) : (
          <p className="p-4 text-center text-[13px] text-slate-500">Pick a day in the calendar to see its full shift.</p>
        )}
      </section>
    </>
  );
}

/*
|--------------------------------------------------------------------------
| MORE ABOUT THIS STUDENT
|--------------------------------------------------------------------------
*/

function MoreAbout({ data, perf, canDecide, online, onApprove, onReject, onOpen, state, setState }: Props) {
  const student = data.student;
  const p = perf?.performance;
  const pendingAbsences = data.absences.filter((item) => item.status === "Pending").length;
  const facts: [string, string][] = p
    ? [
        ["Attendance on scheduled days", p.attendance.rate === null ? "Not yet" : `${p.attendance.rate}% (${p.attendance.attended_days} of ${p.attendance.scheduled_days})`],
        ["Late time-ins", String(p.late_time_ins)],
        ["Logs rejected", String(p.logs_rejected)],
        ["Logs with corrected times", String(p.logs_corrected)],
        ["Tasks on time", `${p.tasks.on_time} of ${p.tasks.assigned}${p.tasks.late > 0 ? `, ${p.tasks.late} late` : ""}`],
        ["Average task rating", p.tasks.average_rating === null ? "None yet" : `${p.tasks.average_rating} of 5`],
        ["Weekly reports", `${p.weekly_reports.submitted} for ${p.weekly_reports.weeks_worked} ${p.weekly_reports.weeks_worked === 1 ? "week" : "weeks"} worked`],
        ["Requirements approved", `${p.requirements.approved} of ${p.requirements.required}`],
        ["Supervisor's star ratings", p.supervisor_rating === null ? "None yet" : `${p.supervisor_rating} of 5`],
        ["Final evaluation", p.final_evaluation ? `${p.final_evaluation.average} of ${p.final_evaluation.scale}` : "Not yet"],
        ["Concerns filed", String(p.concerns)],
      ]
    : [];
  const toggle = (key: keyof OverviewState["open"], open: boolean) => {
    if (state.open[key] !== open) setState({ open: { ...state.open, [key]: open } });
  };
  const fact = (icon: IconName, label: string, value: ReactNode) => (
    <div className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-2.5">
      <Icon name={icon} size={15} className="row-span-2 mt-0.5 text-slate-400" />
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="flex flex-wrap items-center gap-x-1.5 break-words text-sm text-slate-900">{value}</dd>
    </div>
  );
  const scheduleLines = groupSchedule(data);

  return (
    <section aria-labelledby="more-h">
      <BlockHead id="more-h" title="More about this student" description="Open a section when you need the detail." />
      <div className="space-y-2.5">
        <Accordion
          id="record-placement"
          icon="building"
          title="Placement and contact"
          hint={[student.supervisor_name ? `Supervisor: ${student.supervisor_name}` : "No supervisor", student.company].filter(Boolean).join(" · ")}
          badge={!student.supervisor_name ? <StatusBadge status="Unassigned" tone="waiting" /> : !student.supervisor_active ? <StatusBadge status="Supervisor deactivated" tone="neutral" /> : null}
          open={state.open.placement}
          onToggle={(open) => toggle("placement", open)}
        >
          <div className="px-4 pb-4 pt-3 sm:px-5">
            <p className="mb-3.5 text-xs text-slate-500">Mobile and emergency contact are entered by the student on their profile.</p>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
              {fact("briefcase", "Supervisor", student.supervisor_name ? `${student.supervisor_name}${student.supervisor_active ? "" : " (deactivated)"}` : "Unassigned")}
              {fact("building", "Company", student.company || "—")}
              {fact("cap", "Program", student.program || "—")}
              {fact("mail", "Email", <>{student.email}<CopyButton value={student.email} label="email" /></>)}
              {fact("phone", "Mobile", student.phone ? <>{student.phone}<CopyButton value={student.phone} label="mobile number" /></> : <span className="text-slate-500">Not given</span>)}
              {fact(
                "heart",
                "Emergency contact",
                student.emergency_contact_phone ? `${student.emergency_contact_name || "Contact"}, ${student.emergency_contact_phone}` : <span className="text-slate-500">Not given</span>
              )}
              {fact(
                "calendar",
                "Weekly schedule",
                <span className="flex w-full flex-col gap-0.5">
                  {scheduleLines.length === 0 ? (
                    <span className="text-slate-500">No schedule set</span>
                  ) : (
                    scheduleLines.map((line) => (
                      <span key={line.days}>
                        <b className="font-semibold">{line.days}</b> {line.time}
                        {line.focus && <small className="block text-xs text-slate-500">{line.focus}</small>}
                      </span>
                    ))
                  )}
                  <button type="button" onClick={() => onOpen({ kind: "open", tab: "schedule", label: "Edit" })} className="mt-0.5 w-fit text-[13px] font-semibold text-psu-700 hover:underline">
                    Edit schedule
                  </button>
                </span>
              )}
            </dl>
          </div>
        </Accordion>
        {p && (
          <Accordion id="record-figures" icon="chart" title="All performance figures" hint="The 11 counts the status comes from. There is no score." open={state.open.figures} onToggle={(open) => toggle("figures", open)}>
            <dl className="grid gap-x-7 px-4 pb-4 pt-2 sm:grid-cols-2 sm:px-5 xl:grid-cols-3">
              {facts.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-200 py-1.5 text-[13.5px]">
                  <dt className="min-w-0 text-slate-600">{label}</dt>
                  <dd className="tabular shrink-0 font-semibold text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          </Accordion>
        )}
        <Accordion
          id="record-absences"
          icon="ban"
          title="Absences"
          hint={data.absences.length ? `${data.absences.length} filed` : "None filed"}
          badge={pendingAbsences ? <StatusBadge status={`${pendingAbsences} awaiting review`} tone="waiting" /> : null}
          open={state.open.absences}
          onToggle={(open) => toggle("absences", open)}
        >
          {data.absences.length === 0 ? (
            <EmptyState icon="calendar" title="No absences filed" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.absences.map((item) => {
                const pending: Pending = { kind: "absence", id: item.id, label: `Absence on ${formatDayDate(item.date)}` };
                return (
                  <li key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{formatDayDate(item.date)}</p>
                      <p className="text-sm text-slate-600">{item.reason}</p>
                      {item.review_notes && <p className="text-sm text-slate-500">Note: {item.review_notes}</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <StatusBadge status={item.status === "Pending" ? "Awaiting review" : item.status} tone={item.status === "Excused" ? "good" : item.status === "Unexcused" ? "bad" : "waiting"} />
                      {canDecide && item.status === "Pending" && (
                        <DecideButtons approveLabel="Excuse" rejectLabel="Unexcused" onApprove={() => onApprove(pending)} onReject={() => onReject(pending)} online={online} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Accordion>
      </div>
    </section>
  );
}

/** Consecutive days with the same hours as one line: "Mon–Thu 8:00 AM – 12:00 PM". */
function groupSchedule(data: Overview): { days: string; time: string; focus: string | null }[] {
  const order = [...WEEKDAYS.slice(1), WEEKDAYS[0]] as string[];
  const rows = [...data.schedule].sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day));
  const groups: { names: string[]; start: string; end: string; focus: string | null; last: number }[] = [];
  for (const row of rows) {
    const start = String(row.start_time).slice(0, 5);
    const end = String(row.end_time).slice(0, 5);
    const index = order.indexOf(row.day);
    const previous = groups.at(-1);
    if (previous && previous.start === start && previous.end === end && !previous.focus && !row.focus && previous.last === index - 1) {
      previous.names.push(row.day);
      previous.last = index;
    } else groups.push({ names: [row.day], start, end, focus: row.focus, last: index });
  }
  return groups.map((group) => ({
    days: group.names.length > 1 ? `${group.names[0].slice(0, 3)}–${group.names.at(-1)!.slice(0, 3)}` : group.names[0].slice(0, 3),
    time: `${minutesLabel(clockMinutes(group.start))} – ${minutesLabel(clockMinutes(group.end))}`,
    focus: group.focus,
  }));
}

function Accordion({
  id,
  icon,
  title,
  hint,
  badge,
  open,
  onToggle,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  hint: string;
  badge?: ReactNode;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details id={id} open={open} onToggle={(event) => onToggle((event.currentTarget as HTMLDetailsElement).open)} className="group rounded-2xl border border-slate-200/80 bg-white shadow-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3.5 hover:bg-slate-50 group-open:rounded-b-none group-open:border-b group-open:border-slate-100 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-psu-50 text-psu-700 ring-1 ring-inset ring-psu-600/10"><Icon name={icon} size={15} /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-[14.5px] font-semibold text-slate-900">{title}</b>
          <span className="block truncate text-xs text-slate-500">{hint}</span>
        </span>
        {badge}
        <Icon name="chevron-right" size={15} className="shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
      </summary>
      {children}
    </details>
  );
}
