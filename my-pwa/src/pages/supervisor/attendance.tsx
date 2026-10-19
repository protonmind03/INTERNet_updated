import StepMarks from "../../components/StepMarks";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import DateRangeFilter from "../../components/DateRangeFilter";
import Icon from "../../components/Icon";
import Pagination from "../../components/Pagination";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  Modal,
  RowMenu,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { isWithinDateRange } from "../../lib/dateRange";
import { formatDayDate, formatHours, formatTime } from "../../lib/format";
import { useAccount } from "../../lib/session";
import { usePagination } from "../../lib/usePagination";
import { focusId, recordId, useFocus } from "../../lib/useFocusRecord";
import { toast } from "../../lib/toast";
import RecordTimeIn from "./RecordTimeIn";
import ReviewDetail, { CorrectTimesDialog } from "./ReviewDetail";
import { useSupervisorWork, type AttendanceEntry } from "./useSupervisorWork";
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

export default function SupervisorAttendanceApproval() {
  const supervisor = useAccount("supervisor");
  const work = useSupervisorWork(supervisor?.supervisor_id, ["interns", "attendance", "absences"]);
  const { attendance, interns, loading } = work;

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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  // The log whose times are being corrected straight from its row.
  const [correctingId, setCorrectingId] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);

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

  // The absences list follows the same intern, search and date filters.
  const visibleAbsences = useMemo(() => {
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
  const absencePager = usePagination(visibleAbsences, 10);
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
  const filtered =
    view.chips.length > 0 || internId !== "" || search.trim() !== "" || dateFrom !== "" || dateTo !== "";

  return (
    <SupervisorLayout
      title="Attendance"
      subtitle="Every attendance log from your interns. Pending logs can also be cleared from Review."
      actions={
        <Button variant="secondary" icon="camera" onClick={() => setRecording(true)}>
          Record time-in
        </Button>
      }
    >
      <div className="space-y-5">
        {work.error && <ErrorNotice message={work.error} onRetry={() => void work.reload()} />}

        <Card>
          <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
            <div className="flex flex-wrap gap-3">
              <label className="relative block min-w-0 flex-1 sm:max-w-xs">
                <span className="sr-only">Search attendance</span>
                <Icon
                  name="search"
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by intern or note"
                  className="field pl-9"
                />
              </label>
              <InternGroupSelect state={grouping} onChange={() => setInternId("")} />
              <label className="block w-full sm:w-56">
                <span className="sr-only">Intern</span>
                <select
                  value={internId}
                  onChange={(event) => setInternId(event.target.value)}
                  className="field"
                >
                  <option value="">All interns</option>
                  {interns.filter((intern) => inGroup(intern.student_id)).map((intern) => (
                    <option key={intern.student_id} value={intern.student_id}>
                      {intern.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="block w-full text-xs font-medium text-slate-600 sm:w-48">
                Group by
                <select
                  value={view.group}
                  onChange={(event) => setView((current) => ({ ...current, group: event.target.value as AttendanceView["group"] }))}
                  className="field mt-1"
                >
                  {GROUP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block w-full text-xs font-medium text-slate-600 sm:w-56">
                Sort
                <select
                  value={view.sort}
                  onChange={(event) => setView((current) => ({ ...current, sort: event.target.value as AttendanceView["sort"] }))}
                  className="field mt-1"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div role="group" aria-label="Filter logs" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {CHIPS.map((chip) => {
                const on = view.chips.includes(chip.value);
                return (
                  <button
                    key={chip.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleChip(chip.value)}
                    className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors ${
                      on
                        ? "bg-linear-to-b from-psu-600 to-psu-700 text-white shadow-sm shadow-psu-900/20"
                        : "border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    {on && <Icon name="check" size={14} />}
                    {chip.label}
                    <span className={`tabular rounded-full px-1.5 text-xs ${on ? "bg-white/20" : "bg-slate-100 text-slate-600"}`}>
                      {chipCounts[chip.value]}
                    </span>
                  </button>
                );
              })}
              {view.chips.length > 0 && (
                <button
                  type="button"
                  onClick={() => setView((current) => ({ ...current, chips: [] }))}
                  className="inline-flex h-9 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-psu-700 hover:bg-psu-50"
                >
                  Clear filters
                </button>
              )}
            </div>
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onChange={(from, to) => {
                setDateFrom(from);
                setDateTo(to);
              }}
            />
          </div>

          {loading ? (
            <SkeletonRows rows={6} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={filtered ? "search" : "clock"}
              title={filtered ? "No logs match these filters" : "No attendance yet"}
              description={
                filtered ? undefined : "Logs appear here when your interns time in."
              }
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
                            <button
                              type="button"
                              onClick={() => setOpenId(entry.id)}
                              className="block min-w-0 flex-1 py-3.5 pl-4 pr-1 text-left hover:bg-slate-50"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {entry.student_name}
                                  </p>
                                  <p className="tabular text-sm text-slate-600">
                                    {formatDayDate(entry.date)} · {formatTime(entry.time_in)} –{" "}
                                    {formatTime(entry.time_out)}
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
                                  {
                                    label: awaitsReview(entry) ? "Review" : "View",
                                    icon: "clipboard",
                                    onSelect: () => setOpenId(entry.id),
                                  },
                                  {
                                    label: "Correct the times",
                                    icon: "edit",
                                    onSelect: () => setCorrectingId(entry.id),
                                  },
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
                          <th
                            colSpan={8}
                            scope="rowgroup"
                            className="sticky top-[calc(var(--inb-top-inset)+3.5rem)] z-10 bg-slate-50/95 p-0 text-left font-normal backdrop-blur"
                          >
                            <GroupHeader group={run.group} inTable />
                          </th>
                        </tr>
                        {run.entries.map((entry) => (
                          <tr key={entry.id} id={recordId("attendance", entry.id)} className="hover:bg-slate-50">
                            <td className="px-5 py-3 font-medium text-slate-900">
                              {entry.student_name}
                              <LogMarks entry={entry} />
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                              {formatDayDate(entry.date)}
                            </td>
                            <td className="tabular whitespace-nowrap px-3 py-3 text-slate-700">
                              {formatTime(entry.time_in)}
                            </td>
                            <td className="tabular whitespace-nowrap px-3 py-3 text-slate-700">
                              {breakText(entry)}
                            </td>
                            <td className="tabular whitespace-nowrap px-3 py-3 text-slate-700">
                              {formatTime(entry.time_out)}
                            </td>
                            <td className="tabular whitespace-nowrap px-3 py-3 text-right font-medium text-slate-900">
                              {formatHours(entry.hours)}
                            </td>
                            <td className="px-3 py-3">
                              {entry.capture_method === "supervisor" && !entry.time_out ? (
                                <StatusBadge status="Recorded by you" tone="info" />
                              ) : (
                                <StatusBadge status={entry.status} />
                              )}
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => setOpenId(entry.id)}
                                  className="rounded-md px-2 py-1 text-sm font-semibold text-psu-700 hover:bg-psu-50"
                                >
                                  {awaitsReview(entry) ? "Review" : "View"}
                                </button>
                                <RowMenu
                                  label={`More for ${entry.student_name}, ${formatDayDate(entry.date)}`}
                                  items={[
                                    {
                                      label: "Correct the times",
                                      icon: "edit",
                                      onSelect: () => setCorrectingId(entry.id),
                                    },
                                  ]}
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

              <Pagination
                state={pager}
                noun="log"
                extra={`${formatHours(totalHours)} verified across these results`}
              />
            </>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Absences"
            description="Filed by your interns. Pending ones are waiting in Review."
          />
          <div className="mt-3">
            {loading ? (
              <SkeletonRows rows={2} />
            ) : visibleAbsences.length === 0 ? (
              <EmptyState
                icon="calendar"
                title={
                  work.absences.length === 0
                    ? "No absences filed"
                    : "No absences match these filters"
                }
              />
            ) : (
              <>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {absencePager.pageItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {item.student_name}
                          <span className="font-normal text-slate-500">
                            {" "}
                            · {formatDayDate(item.date)}
                          </span>
                        </p>
                        <p className="text-sm text-slate-600">{item.reason}</p>
                        {item.review_notes && (
                          <p className="text-sm text-slate-500">Your note: {item.review_notes}</p>
                        )}
                      </div>
                      <StatusBadge
                        status={item.status === "Pending" ? "To review" : item.status}
                        tone={
                          item.status === "Excused"
                            ? "good"
                            : item.status === "Unexcused"
                              ? "bad"
                              : "waiting"
                        }
                      />
                    </li>
                  ))}
              </ul>
              <Pagination state={absencePager} noun="absence" />
              </>
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={opened !== null}
        onClose={closeDetail}
        title={opened ? opened.student_name : ""}
        size="lg"
      >
        {/* A decided log shows the same view, offering only the other decision. */}
        {opened && (
          <ReviewDetail
            item={{
              kind: "attendance",
              key: `attendance-${opened.id}`,
              waitingSince: opened.time_in || opened.date,
              entry: opened,
            }}
            work={work}
            onDecided={closeDetail}
          />
        )}
      </Modal>

      {/* The same dialog the log's detail opens. */}
      {correcting && (
        <CorrectTimesDialog
          key={correcting.id}
          entry={correcting}
          work={work}
          onClose={() => setCorrectingId(null)}
        />
      )}

      <RecordTimeIn open={recording} onClose={() => setRecording(false)} work={work} />
    </SupervisorLayout>
  );
}
