import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Meter, SummaryTiles, type SummaryTile } from "../../components/display";
import Icon from "../../components/Icon";
import Pagination from "../../components/Pagination";
import { Button, Card, CardHeader, EmptyState, SearchField, SkeletonRows, StatusBadge } from "../../components/ui";
import { saveCsv } from "../../lib/csv";
import { formatDate, formatHours } from "../../lib/format";
import { toast } from "../../lib/toast";
import { usePagination } from "../../lib/usePagination";
import { phStamp, phToday } from "../../lib/phTime";
import {
  STATUS_ORDER,
  STATUS_TONE,
  fetchPerformance,
  fetchStudentPerformance,
  performancePdfSection,
  performanceSection,
  type PerformanceRules,
  type PerformanceStatus,
  type PerformanceStudent,
} from "./performance";

type Shown = "all" | PerformanceStatus;

/** The status tiles above the table: a count of each word, and the filter by it (system pass). */
const STATUS_TILE: Record<PerformanceStatus, Pick<SummaryTile<Shown>, "icon" | "tone">> = {
  "At risk": { icon: "alert", tone: "danger" },
  Behind: { icon: "hourglass", tone: "warning" },
  "On track": { icon: "trend-up", tone: "info" },
  Completed: { icon: "check-circle", tone: "success" },
};

/*
|--------------------------------------------------------------------------
| STUDENT PERFORMANCE: THE TABLE, AND ONE STUDENT'S SUMMARY
|--------------------------------------------------------------------------
|
| One row per active student with the figures the server counted, a status
| word and a sentence. There is no score: the columns are not added up. The
| "?" beside the status shows the rules the words come from, as the server
| sent them.
|
*/

/** The "?" that says what the status words mean. */
export function StatusRules({ rules }: { rules: PerformanceRules | null }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="print:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <span aria-hidden="true">?</span>
        <span className="sr-only">What the status words mean</span>
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="mt-2 block rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-sm font-normal text-slate-700"
        >
          <span className="block font-semibold text-slate-900">
            The status is the first of these that fits. It is not a score.
          </span>
          {rules ? (
            <span className="mt-1.5 block space-y-1">
              {rules.rules.map((rule) => (
                <span key={rule.status} className="block">
                  <span className="font-semibold text-slate-900">{rule.status}:</span> {rule.rule}
                </span>
              ))}
              <span className="block text-slate-600">
                A time-in is late when it is more than {rules.thresholds.late_after_minutes} minutes after the
                shift's start. A task is late when it was submitted after its due date, or is past it and not
                submitted.
              </span>
            </span>
          ) : (
            <span className="mt-1 block">The rules could not be loaded.</span>
          )}
        </span>
      )}
    </span>
  );
}

type SortKey = "name" | "status" | "hours" | "finish" | "attendance" | "late" | "tasks" | "rating" | "concerns";

const COLUMNS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: "name", label: "Student" },
  { key: "status", label: "Status" },
  { key: "hours", label: "Hours", right: true },
  { key: "finish", label: "Finishes" },
  { key: "attendance", label: "Attendance", right: true },
  { key: "late", label: "Late time-ins", right: true },
  { key: "tasks", label: "Tasks late", right: true },
  { key: "rating", label: "Evaluation", right: true },
  { key: "concerns", label: "Concerns", right: true },
];

/** What a row is sorted by, for each column. Empty values go last either way. */
function sortValue(row: PerformanceStudent, key: SortKey): string | number | null {
  const p = row.performance;
  if (key === "name") return row.name.toLowerCase();
  if (key === "status") return STATUS_ORDER[p.status];
  if (key === "hours") return row.required_hours > 0 ? row.verified_hours / row.required_hours : 0;
  if (key === "finish") return row.projected_finish;
  if (key === "attendance") return p.attendance.rate;
  if (key === "late") return p.late_time_ins;
  if (key === "tasks") return p.tasks.late;
  if (key === "rating") return p.final_evaluation ? p.final_evaluation.average : p.supervisor_rating;
  return p.concerns;
}

/** `query` is the coordinator's filters as sent to the server; `covered` names them for a file. */
export default function StudentPerformance({ query, covered }: { query: string; covered: string }) {
  const [state, setState] = useState<{ query: string; students: PerformanceStudent[]; rules: PerformanceRules } | null>(null);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; down: boolean }>({ key: "status", down: false });
  const [buildingPdf, setBuildingPdf] = useState(false);
  const [shown, setShown] = useState<Shown>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let current = true;
    fetchPerformance(query)
      .then((answer) => {
        if (!current) return;
        setState({ query, students: answer.students, rules: answer });
        setFailed(false);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [query]);

  const loading = !state || state.query !== query;
  const sorted = useMemo(() => {
    const rows = [...(state?.students ?? [])];
    rows.sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      if (x === null || y === null) return x === y ? a.name.localeCompare(b.name) : x === null ? 1 : -1;
      const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return (sort.down ? -order : order) || a.name.localeCompare(b.name);
    });
    return rows;
  }, [state, sort]);
  // A status tile and a name search narrow the table; the files keep every student.
  const visible = useMemo(() => {
    const text = search.trim().toLowerCase();
    return sorted.filter(
      (row) =>
        (shown === "all" || row.performance.status === shown) &&
        (!text || [row.name, row.student_id, row.program, row.program_code, row.block].some((value) => String(value ?? "").toLowerCase().includes(text)))
    );
  }, [sorted, shown, search]);
  const tiles: SummaryTile<Shown>[] = [
    { value: "all", label: "All students", count: state ? sorted.length : null, icon: "users", tone: "brand" },
    ...(Object.keys(STATUS_ORDER) as PerformanceStatus[]).map((status) => ({
      value: status,
      label: status,
      count: state ? sorted.filter((row) => row.performance.status === status).length : null,
      ...STATUS_TILE[status],
    })),
  ];
  const pager = usePagination(visible, 10);

  const fileName = (extension: string) => `internet-student-performance-${phToday()}.${extension}`;
  const downloadCsv = () => {
    const section = performanceSection(sorted);
    saveCsv(
      [["INTERNet Student Performance"], ["Generated at", phStamp()], ["Students", covered], [], section.head, ...section.rows],
      fileName("csv")
    );
  };
  const downloadPdf = async () => {
    setBuildingPdf(true);
    try {
      const { buildAnalyticsPdf } = await import("../../lib/analyticsPdf");
      buildAnalyticsPdf(
        [
          performancePdfSection(sorted),
          {
            title: "What the status words mean",
            head: ["Status", "Rule"],
            rows: (state?.rules.rules ?? []).map((rule) => [rule.status, rule.rule]),
          },
        ],
        `${phStamp()} · Students: ${covered}`,
        "INTERNet Student Performance"
      ).save(fileName("pdf"));
      toast.success("Student performance PDF ready.");
    } catch {
      toast.error("The PDF could not be generated. Please try again.");
    } finally {
      setBuildingPdf(false);
    }
  };

  return (
    <Card className="min-w-0">
      <CardHeader
        icon="users"
        title="Student performance"
        description="Counted from each student's records. No score: sort by the column you care about."
        action={
          !loading && sorted.length > 0 ? (
            <span className="flex flex-wrap justify-end gap-2 print:hidden">
              <Button variant="secondary" icon="download" onClick={downloadCsv}>
                CSV<span className="sr-only"> of student performance</span>
              </Button>
              <Button variant="secondary" icon="download" busy={buildingPdf} busyProcess="export" onClick={() => void downloadPdf()}>
                PDF<span className="sr-only"> of student performance</span>
              </Button>
            </span>
          ) : undefined
        }
      />
      <div className="px-4 pt-3 sm:px-5">
        <SummaryTiles label="Show students by status" tiles={tiles} value={shown} onChange={setShown} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <SearchField value={search} onChange={setSearch} label="Search students" placeholder="Search by name, ID, program or block" className="w-full sm:w-80" />
          <p className="m-0">
            <span className="text-sm text-slate-600">What the status words mean </span>
            <StatusRules rules={state?.rules ?? null} />
          </p>
        </div>
      </div>
      <div className="mt-3">
        {failed && loading ? (
          <p role="alert" className="px-5 pb-5 text-sm text-red-700">
            The students' performance could not be loaded.
          </p>
        ) : loading ? (
          <SkeletonRows rows={4} />
        ) : sorted.length === 0 ? (
          <EmptyState icon="users" title="No active students" />
        ) : visible.length === 0 ? (
          <EmptyState icon={search.trim() ? "search" : "check-circle"} title={search.trim() ? "No students match" : `No students are ${shown === "all" ? "listed" : shown.toLowerCase()}`} />
        ) : (
          <>
            <div className="relative overflow-x-auto" tabIndex={0} role="group" aria-label="Student performance">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="table-head border-y border-slate-100 text-xs text-slate-600">
                    {COLUMNS.map((column, index) => {
                      const active = sort.key === column.key;
                      return (
                        <th
                          key={column.key}
                          scope="col"
                          aria-sort={active ? (sort.down ? "descending" : "ascending") : "none"}
                          className={`py-1.5 font-medium ${index === 0 ? "pl-5 pr-3" : index === COLUMNS.length - 1 ? "pl-3 pr-5" : "px-3"} ${column.right ? "text-right" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => setSort({ key: column.key, down: active ? !sort.down : false })}
                            className={`inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-md px-1 font-medium hover:text-slate-900 ${
                              active ? "text-slate-900" : ""
                            }`}
                          >
                            {column.label}
                            <Icon
                              name="chevron-down"
                              size={12}
                              className={`${active ? "" : "opacity-0"} ${active && !sort.down ? "rotate-180" : ""}`}
                            />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pager.pageItems.map((row) => {
                    const p = row.performance;
                    return (
                      <tr key={row.student_id} className="align-top hover:bg-slate-50">
                        <th scope="row" className="min-w-64 py-3 pl-5 pr-3 text-left font-normal">
                          <Link
                            to={`/coordinator/students/${encodeURIComponent(row.student_id)}`}
                            className="font-semibold text-psu-700 hover:underline"
                          >
                            {row.name}
                          </Link>
                          <span className="block text-xs text-slate-600">{row.block || row.program_code || row.program || "No program"}</span>
                          <span className="mt-1 line-clamp-2 max-w-md text-xs text-slate-600">{p.summary}</span>
                        </th>
                        <td className="px-3 py-3">
                          <StatusBadge status={p.status} tone={STATUS_TONE[p.status]} />
                        </td>
                        <td className="tabular whitespace-nowrap px-3 py-3 text-right text-slate-700">
                          {formatHours(row.verified_hours)} of {formatHours(row.required_hours)}
                          <Meter
                            value={row.required_hours > 0 ? row.verified_hours / row.required_hours : 0}
                            tone={STATUS_TILE[p.status].tone}
                            label={`${row.name}: hours`}
                            className="ml-auto mt-1.5 w-24"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                          {p.status === "Completed" ? "Done" : row.projected_finish ? formatDate(row.projected_finish) : "No date"}
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-700">
                          {p.attendance.rate === null ? "–" : `${p.attendance.rate}%`}
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-700">{p.late_time_ins}</td>
                        <td className="tabular px-3 py-3 text-right text-slate-700">
                          {p.tasks.late}
                          <span className="text-slate-600"> of {p.tasks.assigned}</span>
                        </td>
                        <td className="tabular whitespace-nowrap px-3 py-3 text-right text-slate-700">
                          {p.final_evaluation
                            ? `${p.final_evaluation.average} of ${p.final_evaluation.scale}`
                            : p.supervisor_rating !== null
                              ? `${p.supervisor_rating} of 5`
                              : "–"}
                        </td>
                        <td className="tabular py-3 pl-3 pr-5 text-right text-slate-700">{p.concerns}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination state={pager} noun="student" />
            <p className="px-5 pb-4 pt-2 text-xs text-slate-600">
              Evaluation is the final evaluation's average when there is one, otherwise the average of the
              supervisor's star ratings. The CSV has every figure in a column of its own.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

/** One student's summary, for the top of their record. Shows nothing for a student who is not active. */
export function PerformanceSummary({ studentId }: { studentId: string }) {
  const [state, setState] = useState<{ id: string; student: PerformanceStudent | null; rules: PerformanceRules } | null>(null);

  useEffect(() => {
    let current = true;
    fetchStudentPerformance(studentId)
      .then((answer) => {
        if (current) setState({ id: studentId, student: answer.student, rules: answer });
      })
      // Extra to the record: if it cannot be loaded the record stands without it.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [studentId]);

  if (!state || state.id !== studentId || !state.student) return null;
  const { student } = state;
  const p = student.performance;
  const facts: [string, string][] = [
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
  ];
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[16px] font-bold text-slate-900">Performance</h2>
        <StatusBadge status={p.status} tone={STATUS_TONE[p.status]} />
        <StatusRules rules={state.rules} />
      </div>
      <p className="mt-2 text-sm text-slate-800">{p.summary}</p>
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-slate-600">{label}</dt>
            <dd className="tabular shrink-0 font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
