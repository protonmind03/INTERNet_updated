import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon, { type IconName } from "../../components/Icon";
import { Skeleton, StatusBadge } from "../../components/ui";
import { formatDuration, formatHours, formatLongDate, formatTime } from "../../lib/format";
import { useScrollPane } from "../../lib/useScrollPane";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { STEP_NAMES } from "./nextStep";
import { useTimeIn } from "./timeInContext";
import { workedMinutes, type AttendanceLog, type DayPlan } from "./useAttendance";

/*
|--------------------------------------------------------------------------
| TODAY'S ATTENDANCE: THE DAY BANNER
|--------------------------------------------------------------------------
|
| Iteration 20. The card a trainee uses every day. Four step tiles, Time in,
| Lunch break, End break and Time out; each shows its time once recorded,
| and the next one (and Time out, since lunch is optional) is the button.
|
| Below 600 px the tiles sit on two pages inside the card, Morning (Time
| in, Lunch break) and Afternoon (End break, Time out), swiped or chosen
| with the Morning | Afternoon switch. Page 1 first; page 2 once Lunch
| break is recorded or the lunch has started. At 600 px and wider, all four
| sit in one row. An afternoon-only day, and a morning or afternoon shift,
| have only Time in and Time out, on one page.
|
| Every time the rules turn on (when the time-in opens, the lunch window,
| late, the afternoon-only cut-off) comes from the server
| (backend/src/services/dayRules.ts): nothing is worked out here.
|
| The dialogs the tiles open, and the attendance itself, are held by
| TimeInProvider, shared with the other places a step can be taken.
|
*/

type TileKey = "time_in" | "break_time" | "break_end_time" | "time_out";

const TILES: Record<TileKey, { label: string; icon: IconName }> = {
  time_in: { label: STEP_NAMES.timeIn, icon: "play" },
  break_time: { label: STEP_NAMES.lunch, icon: "coffee" },
  break_end_time: { label: STEP_NAMES.endBreak, icon: "arrow-right" },
  time_out: { label: STEP_NAMES.timeOut, icon: "stop" },
};

/** "8:00" from "08:00". */
const clockOf = (hhmm: string | null | undefined) => {
  if (!hhmm) return "";
  const [hours, minutes] = hhmm.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")}`;
};

/** Which session today is: as the log says, or as the plan and the clock say before there is one. */
function sessionOf(log: AttendanceLog | undefined, plan: DayPlan | null, now: Date): "full" | "am" | "pm" {
  if (log?.session === "am" || log?.session === "pm" || log?.session === "full") return log.session;
  if (log) return "full";
  if (plan?.kind === "am" || plan?.kind === "pm") return plan.kind;
  if (plan?.pmCutoff && now.getTime() >= Date.parse(plan.pmCutoff)) return "pm";
  return "full";
}

type TileState = "waiting" | "done" | "late" | "early" | "later" | "next" | "closed";

export default function TodayAttendance() {
  const { attendance, now, online, openTimeIn, openStep } = useTimeIn();
  const { todayLog, stage, loading, busy, today: plan } = attendance;
  const wide = useMediaQuery("(min-width: 600px)");
  const session = sessionOf(todayLog, plan, now);
  const twoStep = session !== "full";
  const morningAbsent = session === "pm" && plan?.kind === "full";

  // Before the window opens: Time in waits, with a countdown in its last hour.
  const opensAt = !todayLog ? (session === "pm" && plan?.kind === "full" ? plan?.pmOpensAt : plan?.opensAt) ?? null : null;
  const untilOpen = opensAt ? Date.parse(opensAt) - now.getTime() : 0;
  const notOpen = untilOpen > 0;

  const headline = notOpen
    ? `Time in opens at ${formatTime(opensAt)}`
    : {
        "not-started": morningAbsent ? "Afternoon only today" : "You haven't timed in yet",
        working: "You're on the clock",
        "on-break": "You're on your lunch break",
        back: "You're on the clock",
        done: "You're done for today",
      }[stage];

  const worked = todayLog ? workedMinutes(todayLog, now) : 0;
  const waiting = new Set(todayLog?.waiting ?? []);
  const lunchStarted = Boolean(plan?.lunchStart && plan.date && now.getTime() >= Date.parse(`${plan.date}T${plan.lunchStart}:00+08:00`));

  const stateOf = (key: TileKey): TileState => {
    const value = todayLog?.[key] ?? null;
    if (value) {
      const sentLater =
        (key === "time_in" && todayLog?.waiting?.includes("time-in")) ||
        (key === "break_time" && waiting.has("break")) ||
        (key === "break_end_time" && waiting.has("break-end")) ||
        (key === "time_out" && waiting.has("time-out"));
      if (sentLater || (key === "time_in" && todayLog?.offline_time_in)) return "later";
      if (key === "time_in" && (todayLog?.late_minutes ?? 0) > 0) return "late";
      if (key === "break_end_time" && (todayLog?.lunch_late_minutes ?? 0) > 0) return "late";
      if (key === "time_in" && todayLog?.credited_from && todayLog.time_in && Date.parse(todayLog.credited_from) > Date.parse(todayLog.time_in) + 30_000) return "early";
      return "done";
    }
    if (loading || busy) return "closed";
    if (key === "time_in") return stage === "not-started" && !notOpen ? "next" : "waiting";
    if (key === "break_time") return stage === "working" && !twoStep ? "next" : "waiting";
    if (key === "break_end_time") return stage === "on-break" ? "next" : "waiting";
    if (key === "time_out") return stage === "working" || stage === "on-break" || stage === "back" ? "next" : "waiting";
    return "waiting";
  };

  const act: Record<TileKey, () => void> = {
    time_in: openTimeIn,
    break_time: () => openStep("break"),
    break_end_time: () => openStep("back"),
    time_out: () => openStep("out"),
  };

  const pages: { id: "morning" | "afternoon"; name: string; tiles: TileKey[] }[] = twoStep
    ? [{ id: "morning", name: session === "am" ? "Morning" : "Afternoon", tiles: ["time_in", "time_out"] }]
    : [
        { id: "morning", name: "Morning", tiles: ["time_in", "break_time"] },
        { id: "afternoon", name: "Afternoon", tiles: ["break_end_time", "time_out"] },
      ];

  return (
    <section className="day-banner relative overflow-hidden rounded-2xl shadow-raised" aria-labelledby="day-banner-heading">
      <div className="relative px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="day-banner-muted text-sm">{formatLongDate(now)}</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-56" />
            ) : (
              <h2 id="day-banner-heading" className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
                {headline}
              </h2>
            )}
          </div>
          <p className="day-banner-chip tabular shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold">{formatTime(now)}</p>
        </div>

        {!loading && plan?.shiftStart && plan.kind !== "holiday" && (
          <p className="day-banner-muted mt-1 text-sm">
            Shift {clockOf(plan.shiftStart)} to {clockOf(plan.shiftEnd)}
            {plan.lunchStart && !twoStep ? ` · lunch ${clockOf(plan.lunchStart)} to ${clockOf(plan.lunchEnd)}` : ""}
          </p>
        )}
        {!loading && plan?.kind === "holiday" && <p className="day-banner-muted mt-1 text-sm">Holiday: {plan.holiday}</p>}

        {morningAbsent && !loading && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="status-chip status-chip--absent">Morning · absent</span>
            <Link to="/daily-log?absence=am#absences" className="day-banner-link inline-flex min-h-11 items-center font-semibold underline underline-offset-2">
              File a reason
            </Link>
          </p>
        )}

        {!loading && stage !== "not-started" && todayLog && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <p className="text-sm">
              <span className="text-3xl font-bold">
                {stage === "done" && todayLog.hours !== null ? formatHours(todayLog.hours) : formatDuration(worked)}
              </span>{" "}
              {stage === "done" ? "rendered" : "worked so far"}
            </p>
            {stage === "done" && <StatusBadge status={todayLog.status} />}
          </div>
        )}

        {!loading && todayLog?.waiting && todayLog.waiting.length > 0 && (
          <p role="status" className="mt-3 flex items-start gap-2 text-sm">
            <Icon name="clock" size={16} className="mt-0.5 shrink-0" />
            <span>
              {todayLog.waiting.length === 1 ? "1 step is" : `${todayLog.waiting.length} steps are`} saved on this phone and will be sent
              when you're back online. Keep the app signed in until then.
            </span>
          </p>
        )}

        {!loading && stage === "not-started" && !notOpen && (
          <p className="day-banner-muted mt-2 max-w-md text-sm">
            {online
              ? "Time in from your workplace. A quick camera check takes your photo for your supervisor."
              : "No connection: you can time in without a photo. It is sent when you are back online, and your supervisor confirms it."}
          </p>
        )}
      </div>

      <StepPager
        pages={pages}
        wide={wide}
        lunchRecorded={Boolean(todayLog?.break_time)}
        lunchStarted={lunchStarted}
        render={(key) => (
          <StepTile
            key={key}
            tileKey={key}
            state={stateOf(key)}
            value={todayLog?.[key] ?? null}
            log={todayLog}
            opensAt={key === "time_in" && notOpen ? opensAt : null}
            untilOpen={untilOpen}
            offline={!online}
            onAct={act[key]}
          />
        )}
      />
    </section>
  );
}

/** The tiles, on one row (wide) or on pages (narrow), with the Morning | Afternoon switch. */
function StepPager({
  pages,
  wide,
  lunchRecorded,
  lunchStarted,
  render,
}: {
  pages: { id: "morning" | "afternoon"; name: string; tiles: TileKey[] }[];
  wide: boolean;
  lunchRecorded: boolean;
  lunchStarted: boolean;
  render: (key: TileKey) => React.ReactNode;
}) {
  const id = useId();
  const paneRef = useRef<HTMLDivElement | null>(null);
  const watch = useScrollPane<HTMLDivElement>();
  const [page, setPage] = useState(0);
  const paged = !wide && pages.length > 1;

  // Page 2 once lunch is recorded or the lunch has started; page 1 before.
  const autoPage = paged && (lunchRecorded || lunchStarted) ? 1 : 0;
  const [shownAuto, setShownAuto] = useState(-1);
  useEffect(() => {
    if (!paged || autoPage === shownAuto) return;
    const pane = paneRef.current;
    if (!pane) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    pane.scrollTo({ left: autoPage * pane.clientWidth, behavior: reduce || shownAuto < 0 ? "auto" : "smooth" });
    setPage(autoPage);
    setShownAuto(autoPage);
  }, [paged, autoPage, shownAuto]);

  const goTo = (index: number) => {
    const pane = paneRef.current;
    if (!pane) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    pane.scrollTo({ left: index * pane.clientWidth, behavior: reduce ? "auto" : "smooth" });
    setPage(index);
  };

  if (!paged) {
    return (
      <div className="day-banner-tiles grid gap-2 px-3 pb-3 sm:px-4 sm:pb-4" style={{ gridTemplateColumns: `repeat(${pages.flatMap((p) => p.tiles).length}, minmax(0, 1fr))` }}>
        {pages.flatMap((p) => p.tiles).map(render)}
      </div>
    );
  }

  return (
    <div className="px-3 pb-3">
      <div role="tablist" aria-label="Part of the day" className="day-banner-switch mx-auto mb-2 flex w-fit rounded-full p-1">
        {pages.map((p, index) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`${id}-tab-${p.id}`}
            aria-selected={page === index}
            aria-controls={`${id}-page-${p.id}`}
            tabIndex={page === index ? 0 : -1}
            onClick={() => goTo(index)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                const next = (index + (event.key === "ArrowRight" ? 1 : -1) + pages.length) % pages.length;
                goTo(next);
                document.getElementById(`${id}-tab-${pages[next].id}`)?.focus();
              }
            }}
            className="min-h-11 rounded-full px-4 text-sm font-semibold"
          >
            {p.name}
          </button>
        ))}
      </div>
      <div
        ref={(element) => {
          paneRef.current = element;
          watch(element);
        }}
        data-axis="x"
        className="inb-snap-row"
        onScroll={(event) => {
          const pane = event.currentTarget;
          const index = Math.round(pane.scrollLeft / Math.max(1, pane.clientWidth));
          if (index !== page) setPage(index);
        }}
      >
        {pages.map((p) => (
          <div
            key={p.id}
            role="tabpanel"
            id={`${id}-page-${p.id}`}
            aria-labelledby={`${id}-tab-${p.id}`}
            className="grid w-full shrink-0 snap-start grid-cols-2 gap-2"
          >
            {p.tiles.map(render)}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepTile({
  tileKey,
  state,
  value,
  log,
  opensAt,
  untilOpen,
  offline,
  onAct,
}: {
  tileKey: TileKey;
  state: TileState;
  value: string | null;
  log: AttendanceLog | undefined;
  opensAt: string | null;
  untilOpen: number;
  offline: boolean;
  onAct: () => void;
}) {
  const tile = TILES[tileKey];
  let detail = "";
  if (state === "late" && tileKey === "time_in") detail = `Late by ${log?.late_minutes} min`;
  else if (state === "late") detail = `Back ${log?.lunch_late_minutes} min late`;
  else if (state === "early") detail = `Counts from ${clockOf(log?.scheduled_start)}`;
  else if (state === "later") detail = "Sent later";
  else if (opensAt) {
    const minutes = Math.ceil(untilOpen / 60_000);
    detail = untilOpen < 60 * 60_000 ? `Opens ${formatTime(opensAt)} · in ${minutes} min` : `Opens ${formatTime(opensAt)}`;
  } else if (state === "next" && tileKey === "time_in" && offline) detail = "Without a photo";

  const body = (
    <>
      <span className="flex items-center gap-1.5">
        <Icon name={tile.icon} size={16} className="shrink-0" />
        <span className="step-tile-label">{tile.label}</span>
      </span>
      <span className="step-tile-time tabular">{value ? formatTime(value) : state === "next" ? "Tap to record" : "–"}</span>
      {detail && <span className="step-tile-detail">{detail}</span>}
    </>
  );

  if (state === "next" || opensAt) {
    return (
      <button
        type="button"
        aria-label={tile.label}
        aria-describedby={undefined}
        disabled={Boolean(opensAt)}
        onClick={onAct}
        className={`step-tile step-tile--${opensAt ? "closed" : "next"}`}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={`step-tile step-tile--${state}`} role="group" aria-label={`${tile.label}: ${value ? formatTime(value) : "not yet"}${detail ? `, ${detail}` : ""}`}>
      {body}
    </div>
  );
}
