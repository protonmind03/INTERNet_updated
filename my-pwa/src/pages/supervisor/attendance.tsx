import StepMarks from "../../components/StepMarks";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { UnderlineTabs } from "../../brand/motifs";
import DateRangeFilter from "../../components/DateRangeFilter";
import Icon, { type IconName } from "../../components/Icon";
import Pagination from "../../components/Pagination";
import { Avatar, Button, Card, EmptyState, ErrorNotice, Modal, RowMenu, SkeletonRows, StatusBadge } from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { isWithinDateRange } from "../../lib/dateRange";
import { formatDayDate, formatHours, formatTime } from "../../lib/format";
import { formatPhDay, phAddDays, phToday } from "../../lib/phTime";
import { useAccount } from "../../lib/session";
import { usePagination } from "../../lib/usePagination";
import { focusId, recordId, useFocus } from "../../lib/useFocusRecord";
import { toast } from "../../lib/toast";
import RecordTimeIn from "./RecordTimeIn";
import ReviewDetail, { CorrectTimesDialog } from "./ReviewDetail";
import { useSupervisorWork, type AbsenceEntry, type AttendanceEntry, type Intern } from "./useSupervisorWork";
import InternGroupSelect from "./InternGroups";
import { useInternGroups } from "./useInternGroups";
import { sameId } from "../../lib/ids";
import {
  CHIPS,
  GROUP_OPTIONS,
  SORT_OPTIONS,
  awaitsReview,
  bulkSkipReason,
  groupEntries,
  passesChips,
  readView,
  saveView,
  sortEntries,
  type AttendanceGroup,
  type AttendanceView,
  type Chip,
} from "./attendanceView";
import { useTeams } from "./useTeams";

function breakText(entry: AttendanceEntry): string {
  if (!entry.break_time) return "None";
  return `${formatTime(entry.break_time)} – ${
    entry.break_end_time ? formatTime(entry.break_end_time) : "…"
  }`;
}

/**
 * How the log was made, as small marks on its row: by the intern's camera
 * check or by the supervisor in person, and whether a step's time came
 * from the phone's clock while it was offline. The detail says more.
 */
function LogMarks({ entry }: { entry: AttendanceEntry }) {
  const skipped = bulkSkipReason(entry);
  if (
    !entry.capture_method &&
    !entry.recorded_offline &&
    !entry.offline_time_in &&
    !entry.photo_redo_status &&
    !entry.time_correction_reason &&
    !skipped
  ) {
    return null;
  }
  const mark = "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium";
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {/* Whatever the grouping, a waiting log Verify all leaves out says why. */}
      {skipped && (
        <span className={`${mark} bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-300`} title="Left out of Verify all">
          <Icon name="ban" size={12} />
          <span className="sr-only">Left out of Verify all: </span>
          {skipped}
        </span>
      )}
      {entry.time_correction_reason && (
        <span className={`${mark} bg-slate-100 text-slate-700`}>
          <Icon name="edit" size={12} />
          Time corrected
        </span>
      )}
      {entry.capture_method === "liveness" && (
        <span className={`${mark} bg-slate-100 text-slate-700`}>
          <Icon name="camera" size={12} />
          Camera check
        </span>
      )}
      {entry.photo_redo_status === "required" && (
        <span className={`${mark} bg-amber-50 text-amber-900`}>
          <Icon name="camera" size={12} />
          New photo due
        </span>
      )}
      {entry.photo_redo_status === "missed" && (
        <span className={`${mark} bg-slate-100 text-slate-700`}>
          <Icon name="camera" size={12} />
          Photo not retaken
        </span>
      )}
      {entry.capture_method === "supervisor" && (
        <span className={`${mark} bg-psu-50 text-psu-800`}>
          <Icon name="user" size={12} />
          Recorded in person
        </span>
      )}
      {entry.offline_time_in && entry.offline_attestation ? (
        <span className={`${mark} ${entry.offline_attestation.clock_moved ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-900"}`}>
          <Icon name="check-circle" size={12} />
          Offline · attested{entry.offline_attestation.clock_moved ? ", clock changed" : ""}
        </span>
      ) : entry.offline_time_in ? (
        <span className={`${mark} bg-amber-50 text-amber-900`}>
          <Icon name="clock" size={12} />
          Offline time-in, no photo
        </span>
      ) : (
        entry.recorded_offline && (
          <span className={`${mark} bg-amber-50 text-amber-900`}>
            <Icon name="clock" size={12} />
            Recorded offline
          </span>
        )
      )}
      {/* Iteration 22: how each later step was made. */}
      <StepMarks verifications={entry.step_verifications} compact />
    </span>
  );
}

/** A group's name and counts, kept in view while its logs scroll past. */
function GroupHeader({ group, inTable = false }: { group: AttendanceGroup; inTable?: boolean }) {
  const count = group.entries.length;
  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2 sm:px-5 ${
        inTable ? "" : "sticky top-[calc(var(--inb-top-inset)+3.5rem)] z-10 border-y border-slate-200 bg-slate-50/95 backdrop-blur"
      }`}
    >
      <span className="text-sm font-semibold text-slate-900">{group.label}</span>
      <span className="text-xs text-slate-600">
        {count} {count === 1 ? "log" : "logs"}
        {group.needsReview > 0 && ` · ${group.needsReview} need review`}
      </span>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| ATTENDANCE (sv10-26: one page, three ways to look)
|--------------------------------------------------------------------------
|
| An overview strip first (what needs review, who is in today, this week's
| verified hours, absences to review); each of its tiles takes you there.
| Then three views of the same logs (?view= in the address):
|
|   Logs      the table, grouped and sorted as chosen. One line of tools
|             (search, dates, Group by, Sort, Filters) and the status
|             pills in view; the rarer narrowing (program or block, one
|             intern, the special cases, exact dates) sits behind Filters.
|   Week      interns down, Monday to Sunday across, one week at a time:
|             each day's times and hours in a cell coloured by its status.
|   Absences  what the interns filed, by status, each reviewable here.
|
*/

type View = "logs" | "week" | "absences";
type DatePreset = "all" | "today" | "week" | "last7" | "month" | "custom";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "last7", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Exact dates…" },
];

/** The first and last day a preset covers, in Philippine days. */
function presetRange(preset: DatePreset, today: string): [string, string] {
  if (preset === "today") return [today, today];
  if (preset === "last7") return [phAddDays(today, -6), today];
  if (preset === "month") return [`${today.slice(0, 8)}01`, today];
  if (preset === "week") return [mondayOf(today), today];
  return ["", ""];
}

function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return phAddDays(day, weekday === 0 ? -6 : 1 - weekday);
}

const STATUS_CHIPS = CHIPS.filter((chip) => chip.status);
const SPECIAL_CHIPS = CHIPS.filter((chip) => !chip.status);

const CELL_TONE: Record<string, string> = {
  Verified: "bg-psu-50 text-psu-900 ring-psu-200",
  Pending: "bg-sky-50 text-sky-900 ring-sky-300",
  Rejected: "bg-red-50 text-red-900 ring-red-200",
  Flagged: "bg-red-50 text-red-900 ring-red-200",
};

type AbsenceShown = "all" | "Pending" | "Excused" | "Unexcused";

export default function SupervisorAttendanceApproval() {
  const supervisor = useAccount("supervisor");
  const work = useSupervisorWork(supervisor?.supervisor_id, ["interns", "attendance", "absences"]);
  const { attendance, interns, loading } = work;
  const [params, setParams] = useSearchParams();
  const asked = params.get("view");
  const pageView: View = asked === "week" || asked === "absences" ? asked : "logs";
  const setPageView = (next: View) => {
    const copy = new URLSearchParams(params);
    if (next === "logs") copy.delete("view");
    else copy.set("view", next);
    copy.delete("focus");
    setParams(copy, { replace: true });
  };

  // Group by, Sort and the filter chips, remembered for this supervisor on this device.
  const [view, setView] = useState<AttendanceView>(() => readView(supervisor?.supervisor_id));
  useEffect(() => saveView(supervisor?.supervisor_id, view), [supervisor?.supervisor_id, view]);
  const toggleChip = (chip: Chip) =>
    setView((current) => ({
      ...current,
      chips: current.chips.includes(chip) ? current.chips.filter((item) => item !== chip) : [...current.chips, chip],
    }));
  const teams = useTeams();
  const [internId, setInternId] = useState("");
  // Interns of more than one program or block can be narrowed to one.
  const grouping = useInternGroups();
  const inGroup = grouping.has;
  const [search, setSearch] = useState("");
  const today = phToday();
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [dateFrom, dateTo] = preset === "custom" ? [customFrom, customTo] : presetRange(preset, today);
  const [moreOpen, setMoreOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [openAbsenceId, setOpenAbsenceId] = useState<number | null>(null);
  // The log whose times are being corrected straight from its row.
  const [correctingId, setCorrectingId] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [absenceShown, setAbsenceShown] = useState<AbsenceShown>("all");

  const scoped = useMemo(
    () =>
      (internId ? attendance.filter((entry) => sameId(entry.student_id, internId)) : attendance).filter((entry) =>
        inGroup(entry.student_id)
      ),
    [attendance, internId, inGroup]
  );

  // Search and dates first; each chip's count is taken from what is left.
  const searched = useMemo(() => {
    const text = search.trim().toLowerCase();
    return scoped.filter(
      (entry) =>
        isWithinDateRange(entry.date, dateFrom, dateTo) &&
        (!text ||
          [entry.student_name, entry.student_id, entry.note, entry.review_notes]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(text)))
    );
  }, [scoped, search, dateFrom, dateTo]);
  const chipCounts = useMemo(
    () =>
      Object.fromEntries(CHIPS.map((chip) => [chip.value, searched.filter((entry) => passesChips(entry, [chip.value])).length])) as Record<Chip, number>,
    [searched]
  );
  const visible = useMemo(() => searched.filter((entry) => passesChips(entry, view.chips)), [searched, view.chips]);

  const teamsOf = useMemo(() => {
    const byIntern = new Map<string, string[]>();
    for (const team of teams.list) {
      for (const member of team.members) {
        const id = String(member.student_id);
        byIntern.set(id, [...(byIntern.get(id) ?? []), team.name].sort((a, b) => a.localeCompare(b)));
      }
    }
    return (studentId: string) => byIntern.get(studentId) ?? [];
  }, [teams.list]);
  const groups = useMemo(
    () =>
      groupEntries(sortEntries(visible, view.sort), view.group, {
        blockOf: grouping.blockOf,
        teamsOf,
        dayLabel: (day) => formatDayDate(day),
      }),
    [visible, view.sort, view.group, grouping.blockOf, teamsOf]
  );
  // Every row in group order, each knowing its group, for the headers.
  const rows = useMemo(() => groups.flatMap((group) => group.entries.map((entry) => ({ entry, group }))), [groups]);

  const totalHours = visible
    .filter((entry) => entry.status === "Verified")
    .reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);

  const pager = usePagination(rows, 20);
  // The page's rows as runs of one group, each drawn under its header.
  const runs = useMemo(() => {
    const list: { group: AttendanceGroup; entries: AttendanceEntry[] }[] = [];
    for (const row of pager.pageItems) {
      const last = list[list.length - 1];
      if (last && last.group.key === row.group.key) last.entries.push(row.entry);
      else list.push({ group: row.group, entries: [row.entry] });
    }
    return list;
  }, [pager.pageItems]);

  // The absences follow the same intern, group, search and date filters, and their own status.
  const absencesFiltered = useMemo(() => {
    const text = search.trim().toLowerCase();
    return work.absences.filter(
      (item) =>
        (!internId || sameId(item.student_id, internId)) &&
        inGroup(item.student_id) &&
        isWithinDateRange(item.date, dateFrom, dateTo) &&
        (!text ||
          [item.student_name, item.student_id, item.reason, item.review_notes]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(text)))
    );
  }, [work.absences, internId, inGroup, search, dateFrom, dateTo]);
  const visibleAbsences = absencesFiltered.filter((item) => absenceShown === "all" || item.status === absenceShown);
  const absencePager = usePagination(visibleAbsences, 12);
  const absencesWaiting = work.absences.filter((item) => item.status === "Pending" && inGroup(item.student_id)).length;

  // A notification about one log opens it here (?focus=attendance-12), once.
  const focusedLog = focusId(useFocus(), "attendance");
  const [focusDone, setFocusDone] = useState(false);
  const focusedEntry = !focusDone && focusedLog ? attendance.find((entry) => String(entry.id) === focusedLog) : undefined;
  const opened = attendance.find((entry) => entry.id === openId) ?? focusedEntry ?? null;
  const toldMissing = useRef(false);
  useEffect(() => {
    if (loading || !focusedLog || focusDone || toldMissing.current) return;
    if (!attendance.some((entry) => String(entry.id) === focusedLog)) {
      toldMissing.current = true;
      toast.info("That log is not in your list any more. It may have been removed.");
    }
  }, [loading, focusedLog, focusDone, attendance]);
  const closeDetail = () => {
    setOpenId(null);
    setFocusDone(true);
  };
  const correcting = attendance.find((entry) => entry.id === correctingId) ?? null;
  const openedAbsence = work.absences.find((item) => item.id === openAbsenceId) ?? null;

  // Narrowing beyond the status pills: counted on the Filters button and listed when it is closed.
  const extraFilters = [
    ...view.chips.filter((chip) => SPECIAL_CHIPS.some((item) => item.value === chip)).map((chip) => ({
      key: chip,
      label: CHIPS.find((item) => item.value === chip)!.label,
      clear: () => toggleChip(chip),
    })),
    ...(internId ? [{ key: "intern", label: interns.find((intern) => sameId(intern.student_id, internId))?.name ?? "One intern", clear: () => setInternId("") }] : []),
    ...(preset === "custom" && (customFrom || customTo)
      ? [{ key: "dates", label: `${customFrom ? formatDayDate(customFrom) : "…"} – ${customTo ? formatDayDate(customTo) : "…"}`, clear: () => setPreset("all") }]
      : []),
  ];
  const filtered = view.chips.length > 0 || internId !== "" || search.trim() !== "" || dateFrom !== "" || dateTo !== "";
  const clearAll = () => {
    setView((current) => ({ ...current, chips: [] }));
    setInternId("");
    setSearch("");
    setPreset("all");
  };

  // The overview strip.
  const waitingCount = attendance.filter((entry) => awaitsReview(entry) && inGroup(entry.student_id)).length;
  const inToday = new Set(attendance.filter((entry) => String(entry.date).slice(0, 10) === today && entry.time_in).map((entry) => String(entry.student_id))).size;
  const thisMonday = mondayOf(today);
  const weekHours = attendance
    .filter((entry) => entry.status === "Verified" && String(entry.date).slice(0, 10) >= thisMonday && inGroup(entry.student_id))
    .reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
  const shownInterns = interns.filter((intern) => inGroup(intern.student_id));

  return (
    <SupervisorLayout
      title="Attendance"
      subtitle="Every time-in of your interns: by status, by week, and their absences."
      actions={
        <Button variant="secondary" icon="camera" onClick={() => setRecording(true)}>
          Record time-in
        </Button>
      }
    >
      <div className="space-y-5">
        {work.error && <ErrorNotice message={work.error} onRetry={() => void work.reload()} />}

        {/* The overview: each tile takes you to what it counts. */}
        <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4" aria-label="Attendance at a glance">
          {[
            {
              key: "review",
              icon: "clock" as IconName,
              tone: waitingCount > 0 ? "att-tile--warn" : "",
              value: loading ? "…" : String(waitingCount),
              label: waitingCount === 1 ? "log needs your review" : "logs need your review",
              onClick: () => {
                setPageView("logs");
                setView((current) => ({ ...current, chips: ["review"] }));
              },
            },
            {
              key: "today",
              icon: "users" as IconName,
              tone: "",
              value: loading ? "…" : `${inToday} of ${shownInterns.length}`,
              label: "interns in today",
              onClick: () => {
                setPageView("logs");
                setPreset("today");
              },
            },
            {
              key: "week",
              icon: "calendar" as IconName,
              tone: "",
              value: loading ? "…" : formatHours(weekHours),
              label: "verified this week",
              onClick: () => {
                setWeekStart(thisMonday);
                setPageView("week");
              },
            },
            {
              key: "absences",
              icon: "flag" as IconName,
              tone: absencesWaiting > 0 ? "att-tile--warn" : "",
              value: loading ? "…" : String(absencesWaiting),
              label: absencesWaiting === 1 ? "absence to review" : "absences to review",
              onClick: () => {
                setAbsenceShown(absencesWaiting > 0 ? "Pending" : "all");
                setPageView("absences");
              },
            },
          ].map((tile) => (
            <li key={tile.key}>
              <button type="button" onClick={tile.onClick} className={`att-tile ${tile.tone}`}>
                <span className="att-tile-icon">
                  <Icon name={tile.icon} size={18} />
                </span>
                <span className="min-w-0">
                  <span className="tabular block font-display text-[22px] font-extrabold leading-tight text-slate-900">{tile.value}</span>
                  <span className="block truncate text-[13px] text-slate-600">{tile.label}</span>
                </span>
                <Icon name="chevron-right" size={16} className="ml-auto hidden text-slate-400 sm:block" />
              </button>
            </li>
          ))}
        </ul>

        <UnderlineTabs
          label="Attendance views"
          value={pageView}
          onChange={setPageView}
          tabs={[
            { value: "logs", label: "Logs", count: visible.length },
            { value: "week", label: "Week" },
            { value: "absences", label: "Absences", count: absencesWaiting || undefined },
          ]}
        />

        {/* One line of tools for every view: find, when, and what else. */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block min-w-0 flex-1 basis-52 sm:max-w-xs">
            <span className="sr-only">Search attendance</span>
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by intern or note" className="field pl-9" />
          </label>
          {pageView !== "week" && (
            <label className="block">
              <span className="sr-only">Dates</span>
              <select value={preset} onChange={(event) => setPreset(event.target.value as DatePreset)} className="field w-auto" aria-label="Dates">
                {DATE_PRESETS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {pageView === "logs" && (
            <>
              <label className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-600">
                Group by
                <select
                  value={view.group}
                  onChange={(event) => setView((current) => ({ ...current, group: event.target.value as AttendanceView["group"] }))}
                  className="field w-auto"
                >
                  {GROUP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-600">
                Sort
                <select
                  value={view.sort}
                  onChange={(event) => setView((current) => ({ ...current, sort: event.target.value as AttendanceView["sort"] }))}
                  className="field w-auto"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <button
            type="button"
            onClick={() => setMoreOpen((value) => !value)}
            aria-expanded={moreOpen}
            aria-controls="attendance-more"
            className={`ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold ring-1 ring-inset transition-colors ${
              moreOpen || extraFilters.length > 0 ? "bg-psu-50 text-psu-800 ring-psu-300" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            <Icon name="filter" size={16} />
            Filters
            {extraFilters.length > 0 && <span className="tabular rounded-full bg-psu-700 px-1.5 text-[11px] font-bold text-white">{extraFilters.length}</span>}
          </button>
        </div>

        {moreOpen && (
          <div id="attendance-more" className="att-more grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-inset ring-(--role-hairline) sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Program or block</p>
              <InternGroupSelect state={grouping} onChange={() => setInternId("")} />
            </div>
            <label className="block space-y-1.5">
              <span className="block text-[12px] font-bold uppercase tracking-wide text-slate-500">Intern</span>
              <select value={internId} onChange={(event) => setInternId(event.target.value)} className="field">
                <option value="">All interns</option>
                {shownInterns.map((intern) => (
                  <option key={intern.student_id} value={intern.student_id}>
                    {intern.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1.5 lg:col-span-2">
              <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Exact dates</p>
              <DateRangeFilter
                from={customFrom}
                to={customTo}
                onChange={(from, to) => {
                  setCustomFrom(from);
                  setCustomTo(to);
                  setPreset("custom");
                }}
              />
            </div>
            {pageView === "logs" && (
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Special cases</p>
                <div role="group" aria-label="Special cases" className="flex flex-wrap gap-2">
                  {SPECIAL_CHIPS.map((chip) => (
                    <ChipButton key={chip.value} on={view.chips.includes(chip.value)} label={chip.label} count={chipCounts[chip.value]} onClick={() => toggleChip(chip.value)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {pageView === "logs" && (
          <Card>
            {/* The status pills: always in view, the main way through the logs. */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div role="group" aria-label="Filter logs" className="flex flex-wrap gap-2">
                {STATUS_CHIPS.map((chip) => (
                  <ChipButton key={chip.value} on={view.chips.includes(chip.value)} label={chip.label} count={chipCounts[chip.value]} onClick={() => toggleChip(chip.value)} />
                ))}
              </div>
              {!moreOpen &&
                extraFilters.map((item) => (
                  <button key={item.key} type="button" onClick={item.clear} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-psu-50 px-3 text-sm font-semibold text-psu-800 ring-1 ring-inset ring-psu-200 hover:bg-psu-100">
                    {item.label}
                    <Icon name="close" size={13} />
                    <span className="sr-only">Remove this filter</span>
                  </button>
                ))}
              {filtered && (
                <button type="button" onClick={clearAll} className="ml-auto inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold text-psu-700 hover:bg-psu-50">
                  Clear filters
                </button>
              )}
            </div>

            {loading ? (
              <SkeletonRows rows={6} />
            ) : visible.length === 0 ? (
              <EmptyState
                icon={filtered ? "search" : "clock"}
                title={filtered ? "No logs match these filters" : "No attendance yet"}
                description={filtered ? undefined : "Logs appear here when your interns time in."}
              />
            ) : (
              <>
                <div className="lg:hidden">
                  {runs.map((run, index) => (
                    <section key={`${run.group.key}-${index}`} aria-label={`${run.group.label}, ${run.group.entries.length} logs`}>
                      <GroupHeader group={run.group} />
                      <ul className="divide-y divide-slate-100">
                        {run.entries.map((entry) => (
                          <li key={entry.id} id={recordId("attendance", entry.id)} className="flex items-start">
                            <button type="button" onClick={() => setOpenId(entry.id)} className="block min-w-0 flex-1 py-3.5 pl-4 pr-1 text-left hover:bg-slate-50">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">{entry.student_name}</p>
                                  <p className="tabular text-sm text-slate-600">
                                    {formatDayDate(entry.date)} · {formatTime(entry.time_in)} – {formatTime(entry.time_out)}
                                  </p>
                                </div>
                                <StatusBadge status={entry.status} />
                              </div>
                              <p className="tabular mt-1 text-sm text-slate-500">
                                {formatHours(entry.hours)} · Lunch {breakText(entry).toLowerCase()}
                              </p>
                              <LogMarks entry={entry} />
                            </button>
                            <div className="shrink-0 py-2.5 pr-2">
                              <RowMenu
                                label={`Actions for ${entry.student_name}, ${formatDayDate(entry.date)}`}
                                items={[
                                  { label: awaitsReview(entry) ? "Review" : "View", icon: "clipboard", onSelect: () => setOpenId(entry.id) },
                                  { label: "Correct the times", icon: "edit", onSelect: () => setCorrectingId(entry.id) },
                                ]}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>

                <div className="hidden lg:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="table-head border-b border-slate-100 text-xs text-slate-500">
                        <th scope="col" className="px-5 py-3 font-medium">Intern</th>
                        <th scope="col" className="px-3 py-3 font-medium">Date</th>
                        <th scope="col" className="px-3 py-3 font-medium">Time in</th>
                        <th scope="col" className="px-3 py-3 font-medium">Lunch</th>
                        <th scope="col" className="px-3 py-3 font-medium">Time out</th>
                        <th scope="col" className="px-3 py-3 text-right font-medium">Hours</th>
                        <th scope="col" className="px-3 py-3 font-medium">Status</th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          <span className="sr-only">Open</span>
                        </th>
                      </tr>
                    </thead>
                    {runs.map((run, index) => (
                      <Fragment key={`${run.group.key}-${index}`}>
                        <tbody className="divide-y divide-slate-100 border-t border-slate-200">
                          <tr>
                            <th colSpan={8} scope="rowgroup" className="sticky top-[calc(var(--inb-top-inset)+3.5rem)] z-10 bg-slate-50/95 p-0 text-left font-normal backdrop-blur">
                              <GroupHeader group={run.group} inTable />
                            </th>
                          </tr>
                          {run.entries.map((entry) => (
                            <tr key={entry.id} id={recordId("attendance", entry.id)} className={`hover:bg-slate-50 ${awaitsReview(entry) ? "att-row--waiting" : ""}`}>
                              <td className="px-5 py-3 font-medium text-slate-900">
                                <span className="flex items-center gap-2.5">
                                  <Avatar name={entry.student_name} size="sm" />
                                  <span className="min-w-0">
                                    {entry.student_name}
                                    <LogMarks entry={entry} />
                                  </span>
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatDayDate(entry.date)}</td>
                              <td className="tabular whitespace-nowrap px-3 py-3 text-slate-700">{formatTime(entry.time_in)}</td>
                              <td className="tabular whitespace-nowrap px-3 py-3 text-slate-700">{breakText(entry)}</td>
                              <td className="tabular whitespace-nowrap px-3 py-3 text-slate-700">{formatTime(entry.time_out)}</td>
                              <td className="tabular whitespace-nowrap px-3 py-3 text-right font-medium text-slate-900">{formatHours(entry.hours)}</td>
                              <td className="px-3 py-3">
                                {entry.capture_method === "supervisor" && !entry.time_out ? <StatusBadge status="Recorded by you" tone="info" /> : <StatusBadge status={entry.status} />}
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setOpenId(entry.id)}
                                    className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold ${
                                      awaitsReview(entry) ? "bg-psu-600 text-white hover:bg-psu-700" : "text-psu-700 hover:bg-psu-50"
                                    }`}
                                  >
                                    {awaitsReview(entry) ? "Review" : "View"}
                                  </button>
                                  <RowMenu
                                    label={`More for ${entry.student_name}, ${formatDayDate(entry.date)}`}
                                    items={[{ label: "Correct the times", icon: "edit", onSelect: () => setCorrectingId(entry.id) }]}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Fragment>
                    ))}
                  </table>
                </div>

                <Pagination state={pager} noun="log" extra={`${formatHours(totalHours)} verified across these results`} />
              </>
            )}
          </Card>
        )}

        {pageView === "week" && (
          <WeekBoard
            weekStart={weekStart}
            onWeek={setWeekStart}
            today={today}
            interns={shownInterns.filter((intern) => {
              const text = search.trim().toLowerCase();
              return (!internId || sameId(intern.student_id, internId)) && (!text || intern.name.toLowerCase().includes(text));
            })}
            attendance={attendance}
            absences={work.absences}
            loading={loading}
            onOpen={(id) => setOpenId(id)}
          />
        )}

        {pageView === "absences" && (
          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div role="group" aria-label="Show absences" className="flex flex-wrap gap-2">
                {(["all", "Pending", "Excused", "Unexcused"] as AbsenceShown[]).map((value) => (
                  <ChipButton
                    key={value}
                    on={absenceShown === value}
                    label={value === "all" ? "All" : value === "Pending" ? "To review" : value}
                    count={value === "all" ? absencesFiltered.length : absencesFiltered.filter((item) => item.status === value).length}
                    onClick={() => setAbsenceShown(value)}
                  />
                ))}
              </div>
            </div>
            {loading ? (
              <SkeletonRows rows={3} />
            ) : visibleAbsences.length === 0 ? (
              <EmptyState icon="calendar" title={work.absences.length === 0 ? "No absences filed" : "No absences match"} />
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {absencePager.pageItems.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-start gap-4 px-4 py-3.5 sm:px-5">
                      <span className="att-date" aria-hidden="true">
                        <b>{formatPhDay(String(item.date).slice(0, 10), { day: "numeric" })}</b>
                        <i>{formatPhDay(String(item.date).slice(0, 10), { month: "short" })}</i>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {item.student_name}
                          <span className="font-normal text-slate-500"> · {formatDayDate(item.date)}</span>
                        </p>
                        <p className="text-sm text-slate-600">{item.reason}</p>
                        {item.review_notes && <p className="text-sm text-slate-500">Your note: {item.review_notes}</p>}
                      </div>
                      <StatusBadge
                        status={item.status === "Pending" ? "To review" : item.status}
                        tone={item.status === "Excused" ? "good" : item.status === "Unexcused" ? "bad" : "waiting"}
                      />
                      {item.status === "Pending" && (
                        <Button size="sm" onClick={() => setOpenAbsenceId(item.id)}>
                          Review
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                <Pagination state={absencePager} noun="absence" />
              </>
            )}
          </Card>
        )}
      </div>

      <Modal open={opened !== null} onClose={closeDetail} title={opened ? opened.student_name : ""} size="lg">
        {/* A decided log shows the same view, offering only the other decision. */}
        {opened && (
          <ReviewDetail
            item={{ kind: "attendance", key: `attendance-${opened.id}`, waitingSince: opened.time_in || opened.date, entry: opened }}
            work={work}
            onDecided={closeDetail}
          />
        )}
      </Modal>

      <Modal open={openedAbsence !== null} onClose={() => setOpenAbsenceId(null)} title={openedAbsence ? openedAbsence.student_name : ""} size="lg">
        {openedAbsence && (
          <ReviewDetail
            item={{ kind: "absence", key: `absence-${openedAbsence.id}`, waitingSince: openedAbsence.created_at, entry: openedAbsence }}
            work={work}
            onDecided={() => setOpenAbsenceId(null)}
          />
        )}
      </Modal>

      {/* The same dialog the log's detail opens. */}
      {correcting && <CorrectTimesDialog key={correcting.id} entry={correcting} work={work} onClose={() => setCorrectingId(null)} />}

      <RecordTimeIn open={recording} onClose={() => setRecording(false)} work={work} />
    </SupervisorLayout>
  );
}

function ChipButton({ on, label, count, onClick }: { on: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors ${
        on ? "bg-psu-600 text-white" : "border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50"
      }`}
    >
      {on && <Icon name="check" size={14} />}
      {label}
      <span className={`tabular rounded-full px-1.5 text-xs ${on ? "bg-white/20" : "bg-slate-100 text-slate-600"}`}>{count}</span>
    </button>
  );
}

/** Interns down, Monday to Sunday across: one week of time-ins at a glance. */
function WeekBoard({
  weekStart,
  onWeek,
  today,
  interns,
  attendance,
  absences,
  loading,
  onOpen,
}: {
  weekStart: string;
  onWeek: (monday: string) => void;
  today: string;
  interns: Intern[];
  attendance: AttendanceEntry[];
  absences: AbsenceEntry[];
  loading: boolean;
  onOpen: (id: number) => void;
}) {
  const days = [0, 1, 2, 3, 4, 5, 6].map((offset) => phAddDays(weekStart, offset));
  const logOf = (studentId: string, day: string) => attendance.find((entry) => sameId(entry.student_id, studentId) && String(entry.date).slice(0, 10) === day);
  const absenceOf = (studentId: string, day: string) => absences.find((item) => sameId(item.student_id, studentId) && String(item.date).slice(0, 10) === day);
  const hoursOf = (entries: (AttendanceEntry | undefined)[]) => entries.reduce((sum, entry) => sum + (entry && entry.status === "Verified" ? Number(entry.hours) || 0 : 0), 0);
  const label = `${formatPhDay(days[0], { month: "short", day: "numeric" })} – ${formatPhDay(days[6], { month: "short", day: "numeric", year: "numeric" })}`;
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <button type="button" onClick={() => onWeek(phAddDays(weekStart, -7))} aria-label="Previous week" className="grid h-10 w-10 place-items-center rounded-lg ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
          <Icon name="chevron-left" size={18} />
        </button>
        <p className="min-w-44 text-center font-display text-[16px] font-extrabold text-slate-900" aria-live="polite">
          {label}
        </p>
        <button
          type="button"
          onClick={() => onWeek(phAddDays(weekStart, 7))}
          disabled={weekStart >= mondayOf(today)}
          aria-label="Next week"
          className="grid h-10 w-10 place-items-center rounded-lg ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
        >
          <Icon name="chevron-right" size={18} />
        </button>
        {weekStart !== mondayOf(today) && (
          <button type="button" onClick={() => onWeek(mondayOf(today))} className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-psu-700 hover:bg-psu-50">
            This week
          </button>
        )}
        <ul className="ml-auto flex flex-wrap gap-3 text-[12px] text-slate-600" aria-label="Key">
          {[
            ["bg-psu-200", "Verified"],
            ["bg-sky-200", "To verify"],
            ["bg-red-200", "Rejected"],
            ["bg-amber-200", "Absent"],
          ].map(([swatch, word]) => (
            <li key={word} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${swatch}`} aria-hidden="true" />
              {word}
            </li>
          ))}
        </ul>
      </div>
      {loading ? (
        <SkeletonRows rows={4} />
      ) : interns.length === 0 ? (
        <EmptyState icon="users" title="No interns match" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-56" />
              {days.map((day) => (
                <col key={day} />
              ))}
              <col className="w-24" />
            </colgroup>
            <thead>
              <tr className="table-head text-xs text-slate-500">
                <th scope="col" className="sticky left-0 z-[1] bg-white px-4 py-2.5 font-medium">
                  Intern
                </th>
                {days.map((day) => (
                  <th key={day} scope="col" className={`px-1.5 py-2.5 text-center font-medium ${day === today ? "text-psu-800" : ""}`}>
                    <span className="block text-[11px] uppercase tracking-wide">{formatPhDay(day, { weekday: "short" })}</span>
                    <span className={`mx-auto mt-0.5 grid h-6 w-6 place-items-center rounded-full text-[13px] font-bold ${day === today ? "bg-psu-700 text-white" : "text-slate-800"}`}>
                      {formatPhDay(day, { day: "numeric" })}
                    </span>
                  </th>
                ))}
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Verified
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {interns.map((intern) => {
                const logs = days.map((day) => logOf(intern.student_id, day));
                return (
                  <tr key={intern.student_id}>
                    <th scope="row" className="sticky left-0 z-[1] bg-white px-4 py-2 text-left font-semibold text-slate-900">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={intern.name} size="sm" />
                        <span className="max-w-40 truncate">{intern.name}</span>
                      </span>
                    </th>
                    {days.map((day, index) => {
                      const log = logs[index];
                      const absence = log ? undefined : absenceOf(intern.student_id, day);
                      return (
                        <td key={day} className={`px-1.5 py-1.5 align-top ${day === today ? "bg-psu-50/40" : ""}`}>
                          {log ? (
                            <button
                              type="button"
                              onClick={() => onOpen(log.id)}
                              className={`week-cell ring-1 ring-inset ${CELL_TONE[log.status] ?? CELL_TONE.Pending}`}
                              aria-label={`${intern.name}, ${formatDayDate(day)}: ${log.status}, ${formatTime(log.time_in)} to ${formatTime(log.time_out)}`}
                            >
                              <span className="tabular block text-[12px] font-bold">
                                {formatTime(log.time_in).replace(/\s?[AP]M$/i, "")}–{log.time_out ? formatTime(log.time_out).replace(/\s?[AP]M$/i, "") : "…"}
                              </span>
                              <span className="tabular block text-[11px] opacity-80">{log.time_out ? formatHours(log.hours) : "on the clock"}</span>
                            </button>
                          ) : absence ? (
                            <span className="week-cell bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200">
                              <span className="block text-[12px] font-bold">Absent</span>
                              <span className="block text-[11px] opacity-80">{absence.status === "Pending" ? "to review" : absence.status.toLowerCase()}</span>
                            </span>
                          ) : (
                            <span className="week-cell text-slate-300" aria-label={day > today ? "Ahead" : "No log"}>
                              {day > today ? "" : "—"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="tabular px-4 py-2 text-right font-bold text-slate-900">{formatHours(hoursOf(logs))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 text-[12.5px] text-slate-600">
                <th scope="row" className="sticky left-0 z-[1] bg-slate-50 px-4 py-2 text-left font-semibold">
                  In that day
                </th>
                {days.map((day) => (
                  <td key={day} className="tabular px-1.5 py-2 text-center font-semibold">
                    {day > today ? "" : `${interns.filter((intern) => logOf(intern.student_id, day)).length}/${interns.length}`}
                  </td>
                ))}
                <td className="tabular px-4 py-2 text-right font-bold text-slate-900">{formatHours(hoursOf(interns.flatMap((intern) => days.map((day) => logOf(intern.student_id, day)))))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
