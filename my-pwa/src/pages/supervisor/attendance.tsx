import { useMemo, useState } from "react";
import DateRangeFilter from "../../components/DateRangeFilter";
import Icon from "../../components/Icon";
import Pagination from "../../components/Pagination";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  FilterChips,
  Modal,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { isWithinDateRange } from "../../lib/dateRange";
import { formatDayDate, formatHours, formatTime } from "../../lib/format";
import { useAccount } from "../../lib/session";
import { usePagination } from "../../lib/usePagination";
import RecordTimeIn from "./RecordTimeIn";
import ReviewDetail from "./ReviewDetail";
import { useSupervisorWork, type AttendanceEntry } from "./useSupervisorWork";

type Filter = "all" | "Pending" | "Verified" | "Rejected";

function matches(entry: AttendanceEntry, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "Rejected") return entry.status === "Rejected" || entry.status === "Flagged";
  return entry.status === filter;
}

function breakText(entry: AttendanceEntry): string {
  if (!entry.break_time) return "None";
  return `${formatTime(entry.break_time)} – ${
    entry.break_end_time ? formatTime(entry.break_end_time) : "…"
  }`;
}

export default function SupervisorAttendanceApproval() {
  const supervisor = useAccount("supervisor");
  const work = useSupervisorWork(supervisor?.supervisor_id, ["interns", "attendance", "absences"]);
  const { attendance, interns, loading } = work;

  const [filter, setFilter] = useState<Filter>("all");
  const [internId, setInternId] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);

  const scoped = useMemo(
    () => (internId ? attendance.filter((entry) => entry.student_id === internId) : attendance),
    [attendance, internId]
  );

  const counts = useMemo(
    () => ({
      all: scoped.length,
      Pending: scoped.filter((entry) => matches(entry, "Pending")).length,
      Verified: scoped.filter((entry) => matches(entry, "Verified")).length,
      Rejected: scoped.filter((entry) => matches(entry, "Rejected")).length,
    }),
    [scoped]
  );

  const visible = useMemo(() => {
    const text = search.trim().toLowerCase();
    return scoped.filter(
      (entry) =>
        matches(entry, filter) &&
        isWithinDateRange(entry.date, dateFrom, dateTo) &&
        (!text ||
          [entry.student_name, entry.student_id, entry.note, entry.review_notes]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(text)))
    );
  }, [scoped, filter, search, dateFrom, dateTo]);

  const totalHours = visible
    .filter((entry) => entry.status === "Verified")
    .reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);

  const pager = usePagination(visible, 20);

  // The absences list follows the same intern, search and date filters.
  const visibleAbsences = useMemo(() => {
    const text = search.trim().toLowerCase();
    return work.absences.filter(
      (item) =>
        (!internId || item.student_id === internId) &&
        isWithinDateRange(item.date, dateFrom, dateTo) &&
        (!text ||
          [item.student_name, item.student_id, item.reason, item.review_notes]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(text)))
    );
  }, [work.absences, internId, search, dateFrom, dateTo]);
  const absencePager = usePagination(visibleAbsences, 10);
  const opened = attendance.find((entry) => entry.id === openId) ?? null;
  const filtered =
    filter !== "all" || internId !== "" || search.trim() !== "" || dateFrom !== "" || dateTo !== "";

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
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by intern or note"
                  className="field pl-9"
                />
              </label>
              <label className="block w-full sm:w-56">
                <span className="sr-only">Intern</span>
                <select
                  value={internId}
                  onChange={(event) => setInternId(event.target.value)}
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
            </div>
            <FilterChips
              label="Filter by status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "Pending", label: "Pending", count: counts.Pending },
                { value: "Verified", label: "Verified", count: counts.Verified },
                { value: "Rejected", label: "Rejected", count: counts.Rejected },
              ]}
            />
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
              <ul className="divide-y divide-slate-100 md:hidden">
                {pager.pageItems.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(entry.id)}
                      className="block w-full px-4 py-3.5 text-left hover:bg-slate-50"
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
                        {formatHours(entry.hours)} · Break {breakText(entry).toLowerCase()}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="table-head border-b border-slate-100 text-xs text-slate-500">
                      <th scope="col" className="px-5 py-3 font-medium">Intern</th>
                      <th scope="col" className="px-3 py-3 font-medium">Date</th>
                      <th scope="col" className="px-3 py-3 font-medium">Time in</th>
                      <th scope="col" className="px-3 py-3 font-medium">Break</th>
                      <th scope="col" className="px-3 py-3 font-medium">Time out</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Hours</th>
                      <th scope="col" className="px-3 py-3 font-medium">Status</th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pager.pageItems.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-900">
                          {entry.student_name}
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
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setOpenId(entry.id)}
                            className="rounded-md px-2 py-1 text-sm font-semibold text-psu-700 hover:bg-psu-50"
                          >
                            {entry.status === "Pending" &&
                            !(entry.capture_method === "supervisor" && !entry.time_out)
                              ? "Review"
                              : "View"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
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
        onClose={() => setOpenId(null)}
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
            onDecided={() => setOpenId(null)}
          />
        )}
      </Modal>

      <RecordTimeIn open={recording} onClose={() => setRecording(false)} work={work} />
    </SupervisorLayout>
  );
}
