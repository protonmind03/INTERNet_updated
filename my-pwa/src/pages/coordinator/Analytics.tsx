import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarList,
  Change,
  ChartTable,
  ColumnChart,
  ShareBar,
  type ColumnPoint,
} from "../../components/charts";
import { Callout, JumpNav, SectionTitle } from "../../components/display";
import Icon, { type IconName } from "../../components/Icon";
import type { Tone } from "../../components/tones";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  IconTile,
  ProgressBar,
} from "../../components/ui";
import { BrandLoader } from "../../brand";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import type { ReportSection } from "../../lib/analyticsPdf";
import { saveCsv } from "../../lib/csv";
import { formatDate, formatDateTime, formatHours, phDateKey } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import GroupSummary from "./GroupSummary";
import KpiCards from "./KpiCards";
import { fetchProgrammeReport, programmeSections } from "./programmeReport";
import StudentPerformance from "./StudentPerformance";
import { coordinatorRequest } from "./request";
import FilterBar from "./FilterBar";
import { describeFilters, useStudentFilters } from "./useStudentFilters";
import { formatPh, phCalendarDate, phStamp, phToday } from "../../lib/phTime";

type TrendDay = { day: string; logs: number; hours: number; students: number };

/** The chart's columns: a day, a week or a month of the range. Missing from an older server. */
type TrendGroup = { start: string; end: string; logs: number; hours: number; students: number };
type Grouping = "day" | "week" | "month";

type AnalyticsData = {
  days: number;
  from?: string;
  to?: string;
  group?: Grouping;
  trend?: TrendGroup[];
  attendanceTrend: TrendDay[];
  period: {
    hours: number;
    previousHours: number;
    logs: number;
    previousLogs: number;
    verified: number;
    pending: number;
    rejected: number;
    studentsLogged: number;
    capture: { cameraChecked: number; bySupervisor: number; unchecked: number };
  };
  progress: {
    students: number;
    averageCompletion: number;
    hours: number;
    bands: { label: string; count: number }[];
  };
  companies: {
    company: string | null;
    students: number;
    hours: number;
    averageCompletion: number;
    ratings: number;
    averageRating: number | null;
    complaints: number;
  }[];
  complaintsByCategory: { category: string; count: number; open: number }[];
  taskFunnel: { status: string; count: number; overdue: number }[];
  evaluationSummary: {
    evaluatorType: string;
    category: string;
    count: number;
    averageRating: number;
  }[];
};

const PERIODS = [14, 30, 90] as const;
type Period = (typeof PERIODS)[number];

const TASK_STAGES: Record<string, { label: string; color: string }> = {
  Pending: { label: "Not started", color: "#95a9fc" },
  "In Progress": { label: "Sent back for changes", color: "#637bf4" },
  Submitted: { label: "Waiting for review", color: "#1d36d3" },
  Reviewed: { label: "Reviewed", color: "#0f1e6e" },
};

// Lighter to darker along the same blue: further along is darker.
const BAND_COLORS = ["#c0ceff", "#95a9fc", "#637bf4", "#3a52e6", "#1d36d3", "#0f1e6e"];
// Short enough to sit under six columns on a phone; the full names are in the tooltip and table.
const BAND_AXIS_LABELS = ["0%", "<25%", "25–49%", "50–74%", "75–99%", "Done"];

const EVALUATORS: { type: string; label: string }[] = [
  { type: "supervisor", label: "Supervisors, about students" },
  { type: "coordinator", label: "Coordinator, about students" },
  { type: "student", label: "Students, about their company" },
];

/** "Oct 6" for a "YYYY-MM-DD" day; falls back to the raw value. */
function dayLabel(day: string): string {
  const label = formatDate(day);
  return label === "—" ? day : label.replace(/, \d{4}$/, "");
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** "Oct 2026" for the month a "YYYY-MM-DD" day is in. */
function monthLabel(day: string): string {
  const [year, month] = day.split("-").map(Number);
  return formatPh(phCalendarDate(year, month, 1), { month: "short", year: "numeric" });
}

/** The days the attendance figures cover, in the few ways the page says it. */
function periodWords(data: AnalyticsData): { title: string; sentence: string; plain: string; previous: string } {
  const quick =
    !data.from || !data.to || (data.to === phDateKey(new Date()) && PERIODS.some((period) => period === data.days));
  if (quick) {
    return {
      title: `The last ${data.days} days`,
      sentence: `In the last ${data.days} days`,
      plain: `the last ${data.days} days`,
      previous: `the previous ${data.days} days`,
    };
  }
  const span = `${formatDate(data.from)} to ${formatDate(data.to)}`;
  return {
    title: `${span} (${plural(data.days, "day")})`,
    sentence: `From ${span}`,
    plain: span,
    previous: `the ${plural(data.days, "day")} before`,
  };
}

const GROUP_WORD: Record<Grouping, string> = { day: "day", week: "week", month: "month" };

/**
 * The columns of the hours chart. Up to a month is drawn day by day; a
 * longer period is added up by week, or the columns would be hairlines.
 */
function trendColumns(data: AnalyticsData): { points: ColumnPoint[]; group: Grouping; rows: (string | number)[][] } {
  // An older server sends no groups: the days themselves are the columns.
  const groups: TrendGroup[] =
    data.trend ?? data.attendanceTrend.map((day) => ({ start: day.day, end: day.day, ...day }));
  const group: Grouping = data.trend ? (data.group ?? "day") : "day";
  const name = (row: TrendGroup) =>
    group === "month"
      ? monthLabel(row.start)
      : group === "week" && row.start !== row.end
        ? `${dayLabel(row.start)} to ${dayLabel(row.end)}`
        : dayLabel(row.start);
  return {
    group,
    points: groups.map((row) => ({
      key: row.start,
      label: name(row),
      axisLabel: group === "month" ? monthLabel(row.start) : dayLabel(row.start),
      value: row.hours,
      detail:
        row.logs === 0
          ? "No attendance logged"
          : `${plural(row.logs, "log")} from ${plural(row.students, "student")}`,
    })),
    rows: groups.map((row) => [name(row), formatHours(row.hours), row.logs, row.students]),
  };
}

// One definition of the report's tables, shared by the CSV and PDF exports.
function reportSections(report: AnalyticsData): ReportSection[] {
  const { period, progress } = report;
  const words = periodWords(report);
  return [
    {
      title: `Attendance, ${words.plain}`,
      head: ["Measure", "Value"],
      rows: [
        ["Verified hours", period.hours],
        [`Verified hours, ${words.previous}`, period.previousHours],
        ["Attendance logs", period.logs],
        ["Logs verified", period.verified],
        ["Logs waiting for a supervisor", period.pending],
        ["Logs rejected", period.rejected],
        ["Students who logged attendance", period.studentsLogged],
        ["Photos taken by the camera check", period.capture.cameraChecked],
        ["Photos taken by a supervisor in person", period.capture.bySupervisor],
        ["Photos not camera-checked", period.capture.unchecked],
      ],
    },
    {
      title: `Verified hours per day (${words.plain})`,
      head: ["Date", "Verified hours", "Attendance logs", "Students"],
      rows: report.attendanceTrend.map((day) => [day.day, day.hours, day.logs, day.students]),
    },
    {
      title: "Progress toward required hours (active students)",
      head: ["Progress", "Students"],
      rows: [
        ...progress.bands.map((band) => [band.label, band.count] as (string | number)[]),
        ["Average completion (%)", progress.averageCompletion],
      ],
    },
    {
      title: "Task status",
      head: ["Status", "Tasks", "Past due"],
      rows: report.taskFunnel.map((task) => [
        TASK_STAGES[task.status]?.label ?? task.status,
        task.count,
        task.overdue,
      ]),
    },
    {
      title: "Partner companies",
      head: [
        "Company",
        "Active students",
        "Average completion (%)",
        "Verified hours",
        "Student rating (1-5)",
        "Ratings",
        "Concerns",
      ],
      rows: report.companies.map((company) => [
        company.company || "No company set",
        company.students,
        company.averageCompletion,
        company.hours,
        company.averageRating ?? "",
        company.ratings,
        company.complaints,
      ]),
    },
    {
      title: "Concerns by category",
      head: ["Category", "Concerns", "Still open"],
      rows: report.complaintsByCategory.map((complaint) => [
        complaint.category,
        complaint.count,
        complaint.open,
      ]),
    },
    {
      title: "Evaluation summary",
      head: ["Evaluator role", "Category", "Evaluation count", "Average rating (1-5)"],
      rows: report.evaluationSummary.map((evaluation) => [
        evaluation.evaluatorType,
        evaluation.category,
        evaluation.count,
        evaluation.averageRating,
      ]),
    },
  ];
}

/**
 * The students' projections and the company summary, for the exports. If
 * they cannot be loaded the report is still produced without them.
 */
async function programmeTables(term: string): Promise<ReportSection[]> {
  try {
    return programmeSections(await fetchProgrammeReport(term));
  } catch {
    return [];
  }
}

const reportFileName = (extension: string) =>
  `internet-analytics-${phToday()}.${extension}`;

export default function CoordinatorAnalytics() {
  // The days covered: one of the quick periods, or any first and last day.
  const [range, setRange] = useState<{ days: Period } | { from: string; to: string }>({ days: 14 });
  // How the chart adds the days up. "auto" leaves it to the server (by day up to a month, then by week, then by month).
  const [grouping, setGrouping] = useState<Grouping | "auto">("auto");
  // What is typed in the two date boxes, which is the range only once both are real dates in order.
  const [typed, setTyped] = useState({ from: "", to: "" });
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  // True while a different period is being fetched; the old figures stay up.
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [buildingPdf, setBuildingPdf] = useState(false);
  // Shared with the other coordinator pages.
  const studentFilters = useStudentFilters();
  const term = studentFilters.query;
  const termName = describeFilters(studentFilters);

  const rangeQuery =
    ("days" in range ? `days=${range.days}` : `from=${range.from}&to=${range.to}`) +
    (grouping === "auto" ? "" : `&group=${grouping}`);

  const load = useCallback(async () => {
    try {
      setData(
        await coordinatorRequest<AnalyticsData>(
          `/api/coordinator/analytics?${rangeQuery}${term ? `&${term}` : ""}`
        )
      );
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load analytics."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [term, rangeQuery]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const choosePeriod = (period: Period) => {
    setTyped({ from: "", to: "" });
    if ("days" in range && range.days === period) return;
    setRefreshing(true);
    setRange({ days: period });
  };

  const today = phDateKey(new Date());
  /** Why the two dates typed cannot be a range yet; "" when they can, or when nothing is typed. */
  const dateProblem =
    !typed.from && !typed.to
      ? ""
      : !typed.from || !typed.to
        ? "Choose both a first and a last day."
        : typed.from > typed.to
          ? "The first day must not be after the last day."
          : (Date.parse(typed.to) - Date.parse(typed.from)) / 86_400_000 > 730
            ? "Choose a range of two years or less."
            : "";
  const typeDate = (key: "from" | "to", value: string) => {
    const next = { ...typed, [key]: value };
    setTyped(next);
    if (next.from && next.to && next.from <= next.to && (Date.parse(next.to) - Date.parse(next.from)) / 86_400_000 <= 730) {
      setRefreshing(true);
      setRange({ from: next.from, to: next.to });
    }
  };

  const downloadPdf = async () => {
    if (!data) return;
    setBuildingPdf(true);
    try {
      // Loaded on demand so the PDF library is not part of every page load.
      const { buildAnalyticsPdf } = await import("../../lib/analyticsPdf");
      // The company summary fits a page; the per-student table is in the CSV.
      const programme = (await programmeTables(term)).slice(1);
      buildAnalyticsPdf([...reportSections(data), ...programme], phStamp()).save(
        reportFileName("pdf")
      );
      toast.success("Analytics PDF ready.");
    } catch (pdfError) {
      console.error("ANALYTICS PDF ERROR:", pdfError);
      toast.error("The PDF could not be generated. Please try again.");
    } finally {
      setBuildingPdf(false);
    }
  };

  const downloadCsv = async () => {
    if (!data) return;
    const programme = await programmeTables(term);
    const rows: (string | number)[][] = [
      ["INTERNet Coordinator Analytics Report"],
      ["Generated at", phStamp()],
      ["Students", termName],
      ...[...reportSections(data), ...programme].flatMap((section) => [
        [],
        [section.title],
        section.head,
        ...section.rows,
      ]),
    ];
    saveCsv(rows, reportFileName("csv"));
  };

  const trend = useMemo(
    () => (data ? trendColumns(data) : { points: [], group: "day" as Grouping, rows: [] }),
    [data]
  );
  const words = data ? periodWords(data) : null;

  return (
    <CoordinatorLayout
      title="Analytics"
      subtitle="Programme-wide figures for reports and for decisions about partner companies."
      actions={
        data ? (
          <>
            <Button variant="secondary" icon="printer" onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="secondary" icon="download" onClick={() => void downloadCsv()}>
              CSV
            </Button>
            <Button icon="download" busy={buildingPdf} doneLabel="Ready" busyProcess="export" onClick={() => void downloadPdf()}>
              {buildingPdf ? "Preparing" : "PDF report"}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="mb-5">
        <FilterBar state={studentFilters} />
      </div>
      {data && studentFilters.active && (
        <p className="mb-4 hidden text-sm text-slate-600 print:block">Students covered: {termName}.</p>
      )}
      {error && (
        <div className="mb-5">
          <ErrorNotice message={error} onRetry={() => void load()} />
        </div>
      )}

      {data && (
        <p className="mb-4 hidden text-sm text-slate-600 print:block">
          INTERNet OJT analytics report, generated {formatDateTime(new Date())}. Attendance
          figures cover {words?.plain}; all other figures are to date. Active students only.
        </p>
      )}

      {loading ? (
        <BrandLoader variant="page" role="coordinator" process="analytics" />
      ) : (
        data && (
          <div
            className={`space-y-10 transition-opacity duration-200 ${refreshing ? "opacity-60" : ""}`}
            aria-busy={refreshing}
          >
            <JumpNav sections={SECTIONS} />

            {/* KEY FIGURES: the six figures, and the chosen period in one sentence. */}
            <section className="space-y-4">
              <SectionTitle id="overview" icon="grid" title="Key figures" description="Six plain figures for the students the filters leave; the &ldquo;i&rdquo; on each says what is counted." />
              <KpiCards query={term} />
              <Callout icon="activity" tone="info">
                <b className="text-slate-900">
                  {words?.sentence}: {formatHours(data.period.hours)} verified
                </b>{" "}
                (<Change current={data.period.hours} previous={data.period.previousHours} versus={words?.previous ?? ""} />
                ), from {data.period.logs} attendance {data.period.logs === 1 ? "log" : "logs"} by {data.period.studentsLogged} of{" "}
                {data.progress.students} active {data.progress.students === 1 ? "student" : "students"}.{" "}
                {data.period.logs > 0
                  ? `${Math.round((data.period.verified / data.period.logs) * 100)}% of those logs are verified, ${data.period.pending} waiting and ${data.period.rejected} rejected.`
                  : "No logs in this period."}
              </Callout>
            </section>

            {/* ATTENDANCE: follows the period chosen here. */}
            <section className="space-y-4">
              <SectionTitle
                id="attendance"
                icon="clock"
                title="Attendance"
                description={`${words?.title}, active students only.`}
                action={
                  <div className="flex flex-wrap items-end gap-x-3 gap-y-2 print:hidden">
                    <div role="tablist" aria-label="Period for the attendance figures" className="inline-flex rounded-xl bg-slate-100 p-1">
                      {PERIODS.map((period) => {
                        const chosen = "days" in range && range.days === period;
                        return (
                          <button
                            key={period}
                            type="button"
                            role="tab"
                            aria-selected={chosen}
                            onClick={() => choosePeriod(period)}
                            className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition-colors ${
                              chosen ? "bg-white text-psu-800 shadow-sm ring-1 ring-psu-600/10" : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            {period} days
                          </button>
                        );
                      })}
                    </div>
                    <label className="text-xs font-medium text-slate-600">
                      From
                      <input
                        type="date"
                        value={typed.from}
                        max={typed.to || today}
                        onChange={(event) => typeDate("from", event.target.value)}
                        aria-describedby={dateProblem ? "analytics-range-problem" : undefined}
                        className="field mt-1 block h-10 w-auto px-2.5"
                      />
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      To
                      <input
                        type="date"
                        value={typed.to}
                        min={typed.from || undefined}
                        max={today}
                        onChange={(event) => typeDate("to", event.target.value)}
                        aria-describedby={dateProblem ? "analytics-range-problem" : undefined}
                        className="field mt-1 block h-10 w-auto px-2.5"
                      />
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      Group by
                      <select
                        value={grouping}
                        onChange={(event) => {
                          setRefreshing(true);
                          setGrouping(event.target.value as Grouping | "auto");
                        }}
                        className="field mt-1 block h-10 w-auto px-2.5"
                      >
                        <option value="auto">Automatic</option>
                        <option value="day">Day</option>
                        <option value="week">Week</option>
                        <option value="month">Month</option>
                      </select>
                    </label>
                  </div>
                }
              />
              {dateProblem && (
                <p id="analytics-range-problem" role="alert" className="text-sm text-red-700 print:hidden">
                  {dateProblem}
                </p>
              )}

              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
                <Card className="min-w-0 lg:col-span-2">
                  <CardHeader
                    icon="chart"
                    title={`Verified hours per ${GROUP_WORD[trend.group]}`}
                    description={
                      trend.group === "week"
                        ? "Each column is a week, Monday first. Scroll sideways for more; + and − change the column width."
                        : trend.group === "month"
                          ? "Each column is a month. Scroll sideways for more; + and − change the column width."
                          : "Days with no column had no verified hours. Scroll sideways for more; + and − change the column width."
                    }
                  />
                  <div className="px-4 pb-4 pt-6 sm:px-5">
                    {data.period.hours === 0 && data.period.logs === 0 ? (
                      <p className="py-10 text-center text-sm text-slate-500">
                        No attendance was logged {words?.sentence.replace(/^In /, "in ").replace(/^From /, "from ")}.
                      </p>
                    ) : (
                      <ColumnChart
                        points={trend.points}
                        label={`Verified hours per ${GROUP_WORD[trend.group]}, ${words?.plain}`}
                        format={(value) => formatHours(value)}
                        zoomable
                      />
                    )}
                    <ChartTable
                      head={[trend.group === "day" ? "Date" : trend.group === "week" ? "Week" : "Month", "Verified hours", "Logs", "Students"]}
                      rows={trend.rows}
                    />
                  </div>
                </Card>

                <Card className="min-w-0">
                  <CardHeader icon="check-circle" tone="success" title="Review of these logs" description={plural(data.period.logs, "log") + " in this period"} />
                  <div className="px-4 pb-5 pt-4 sm:px-5">
                    {data.period.logs === 0 ? (
                      <p className="py-6 text-center text-sm text-slate-500">Nothing to review.</p>
                    ) : (
                      <>
                        <ShareBar
                          label="Attendance logs by review status"
                          segments={[
                            { label: "Verified", value: data.period.verified, color: "var(--status-success-ink)" },
                            { label: "Waiting for a supervisor", value: data.period.pending, color: "var(--status-warning-ink)" },
                            { label: "Rejected", value: data.period.rejected, color: "var(--status-late-ink)" },
                          ]}
                        />
                        <p className="mt-5 border-t border-(--role-hairline) pt-4 text-[13px] font-semibold text-slate-700">How the time-in photos were taken</p>
                        <ul className="mt-2.5 grid gap-2">
                          <PhotoSource icon="camera" tone="success" label="Camera check" count={data.period.capture.cameraChecked} />
                          <PhotoSource icon="user" tone="info" label="Supervisor, in person" count={data.period.capture.bySupervisor} />
                          <PhotoSource icon="alert" tone="warning" label="Not camera-checked" count={data.period.capture.unchecked} />
                        </ul>
                      </>
                    )}
                  </div>
                </Card>
              </div>
            </section>

            {/* PROGRESS: totals to date. */}
            <section className="space-y-4">
              <SectionTitle id="progress" icon="trend-up" title="Progress" description="All verified work so far, active students only." />
              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                <Card className="min-w-0">
                  <CardHeader
                    icon="hourglass"
                    title="Progress toward required hours"
                    description={`${plural(data.progress.students, "active student")} · ${data.progress.averageCompletion}% complete on average`}
                  />
                  <div className="px-4 pb-4 pt-7 sm:px-5">
                    {data.progress.students === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-500">No active students yet.</p>
                    ) : (
                      <ColumnChart
                        points={data.progress.bands.map((band, index) => ({
                          key: band.label,
                          label: band.label,
                          axisLabel: BAND_AXIS_LABELS[index],
                          value: band.count,
                          detail: plural(band.count, "student"),
                          color: BAND_COLORS[index],
                        }))}
                        label="Number of students in each band of progress toward their required hours"
                        format={(value) => String(value)}
                        height={150}
                        axis={false}
                        capLabels="all"
                        wholeNumbers
                      />
                    )}
                    <ChartTable head={["Progress", "Students"]} rows={data.progress.bands.map((band) => [band.label, band.count])} />
                  </div>
                </Card>

                <Card className="min-w-0">
                  <TaskStatus stages={data.taskFunnel} />
                </Card>
              </div>
            </section>

            {/* COMPANIES */}
            <section className="space-y-4">
              <SectionTitle id="companies" icon="building" title="Partner companies" description="How interns at each company are progressing, and what they and others have reported." />
              <Card className="min-w-0">
                <CompanyTable companies={data.companies} />
              </Card>
            </section>

            {/* PROGRAMS AND BLOCKS: the company table's twins. */}
            <section className="space-y-4">
              <SectionTitle id="groups" icon="layers" title="Programs and blocks" description="The same students, summed by program and by block." />
              <GroupSummary query={term} />
            </section>

            {/* STUDENTS: student by student, with its own CSV and PDF. */}
            <section className="space-y-4">
              <SectionTitle id="students" icon="users" title="Students" description="Each student's hours, finish, attendance and work. Filter by status; sort by any column." />
              <StudentPerformance query={term} covered={termName} />
            </section>

            {/* CONCERNS AND EVALUATIONS */}
            <section className="space-y-4">
              <SectionTitle id="concerns" icon="flag" title="Concerns and evaluations" description="What students and supervisors reported, and how they rated each other." />
              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                <Card className="min-w-0">
                  <CardHeader
                    icon="flag"
                    tone="warning"
                    title="Concerns by category"
                    description={(() => {
                      const total = data.complaintsByCategory.reduce((sum, row) => sum + row.count, 0);
                      const open = data.complaintsByCategory.reduce((sum, row) => sum + row.open, 0);
                      return total === 0 ? undefined : `${plural(total, "concern")} reported · ${open} still open`;
                    })()}
                    action={
                      <Link to="/coordinator/resolution" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-psu-700 hover:underline print:hidden">
                        Open
                        <Icon name="chevron-right" size={14} />
                      </Link>
                    }
                  />
                  {data.complaintsByCategory.length === 0 ? (
                    <EmptyState icon="flag" title="No concerns have been reported" />
                  ) : (
                    <div className="px-4 pb-5 pt-4 sm:px-5">
                      <BarList
                        rows={data.complaintsByCategory.map((complaint) => ({
                          label: complaint.category,
                          value: complaint.count,
                          note: complaint.open > 0 ? `${complaint.open} still open` : "All settled",
                        }))}
                      />
                    </div>
                  )}
                </Card>

                <Card className="min-w-0">
                  <CardHeader icon="star" title="Evaluation averages" description="Average rating out of 5, by who gave it" />
                  {data.evaluationSummary.length === 0 ? (
                    <EmptyState icon="star" title="No evaluations submitted yet" />
                  ) : (
                    <div className="space-y-5 px-4 pb-5 pt-4 sm:px-5">
                      {EVALUATORS.map((group) => {
                        const rows = data.evaluationSummary.filter((item) => item.evaluatorType === group.type);
                        if (rows.length === 0) return null;
                        return (
                          <div key={group.type}>
                            <p className="mb-2.5 text-[13px] font-semibold text-slate-700">{group.label}</p>
                            <BarList
                              max={5}
                              rows={rows.map((item) => ({
                                label: item.category,
                                value: item.averageRating,
                                display: `${item.averageRating.toFixed(1)} / 5`,
                                note: plural(item.count, "evaluation"),
                              }))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </div>
            </section>
          </div>
        )
      )}
    </CoordinatorLayout>
  );
}

/** The page's sections, for "On this page". */
const SECTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: "overview", label: "Key figures", icon: "grid" },
  { id: "attendance", label: "Attendance", icon: "clock" },
  { id: "progress", label: "Progress", icon: "trend-up" },
  { id: "companies", label: "Companies", icon: "building" },
  { id: "groups", label: "Programs and blocks", icon: "layers" },
  { id: "students", label: "Students", icon: "users" },
  { id: "concerns", label: "Concerns and evaluations", icon: "flag" },
];

function PhotoSource({ icon, tone, label, count }: { icon: IconName; tone: Tone; label: string; count: number }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <IconTile icon={icon} tone={tone} size="sm" />
      <span className="min-w-0 flex-1 text-slate-700">{label}</span>
      <span className="tabular font-semibold text-slate-900">{count}</span>
    </li>
  );
}

function TaskStatus({ stages }: { stages: AnalyticsData["taskFunnel"] }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  const overdue = stages.reduce((sum, stage) => sum + stage.overdue, 0);
  return (
    <>
      <CardHeader
        icon="tasks"
        title="Task status"
        description={
          total === 0
            ? undefined
            : `${plural(total, "task")} assigned${overdue > 0 ? ` · ${overdue} past due` : ""}`
        }
      />
      {total === 0 ? (
        <EmptyState icon="tasks" title="No tasks have been assigned yet" />
      ) : (
        <div className="px-4 pb-5 pt-5 sm:px-5">
          <ShareBar
            label="Tasks by stage"
            segments={stages.map((stage) => ({
              label: TASK_STAGES[stage.status]?.label ?? stage.status,
              value: stage.count,
              color: TASK_STAGES[stage.status]?.color ?? "#94a3b8",
              note: stage.overdue > 0 ? `${stage.overdue} past due` : undefined,
            }))}
          />
        </div>
      )}
    </>
  );
}

function CompanyTable({ companies }: { companies: AnalyticsData["companies"] }) {
  if (companies.length === 0) {
    return <EmptyState icon="building" title="No active students are placed yet" />;
  }
  const rating = (company: AnalyticsData["companies"][number]) =>
    company.averageRating === null ? (
      <span className="text-slate-500">No ratings</span>
    ) : (
      <span className="inline-flex items-center gap-1">
        <Icon name="star" size={14} className="fill-gold-400 text-gold-500" />
        <span className="font-semibold text-slate-900">{company.averageRating.toFixed(1)}</span>
        <span className="text-slate-500">({company.ratings})</span>
      </span>
    );

  return (
    <div className="mt-3">
      {/* Phones: one block per company. */}
      <ul className="divide-y divide-slate-100 border-t border-slate-100 md:hidden">
        {companies.map((company) => (
          <li key={company.company ?? ""} className="px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                {company.company || "No company set"}
              </p>
              <p className="shrink-0 text-sm text-slate-600">
                {plural(company.students, "intern")}
              </p>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <ProgressBar
                value={company.averageCompletion}
                label={`${company.averageCompletion} percent average completion`}
              />
              <span className="tabular shrink-0 text-xs text-slate-600">
                {company.averageCompletion}%
              </span>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
              <span className="tabular">{formatHours(company.hours)} verified</span>
              {rating(company)}
              <span>{plural(company.complaints, "concern")}</span>
            </p>
          </li>
        ))}
      </ul>

      <div className="relative hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="table-head border-y border-slate-100 text-xs text-slate-500">
              <th scope="col" className="px-5 py-3 font-medium">Company</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Interns</th>
              <th scope="col" className="w-56 px-3 py-3 font-medium">Average progress</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Verified hours</th>
              <th scope="col" className="px-3 py-3 font-medium">Student rating</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">Concerns</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {companies.map((company) => (
              <tr key={company.company ?? ""} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">
                  {company.company || <span className="text-slate-500">No company set</span>}
                </td>
                <td className="tabular px-3 py-3 text-right text-slate-700">{company.students}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <ProgressBar
                      value={company.averageCompletion}
                      label={`${company.averageCompletion} percent average completion`}
                    />
                    <span className="tabular w-9 shrink-0 text-right text-xs text-slate-600">
                      {company.averageCompletion}%
                    </span>
                  </div>
                </td>
                <td className="tabular whitespace-nowrap px-3 py-3 text-right text-slate-700">
                  {formatHours(company.hours)}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{rating(company)}</td>
                <td
                  className={`tabular px-5 py-3 text-right ${
                    company.complaints > 0 ? "font-semibold text-slate-900" : "text-slate-500"
                  }`}
                >
                  {company.complaints}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
