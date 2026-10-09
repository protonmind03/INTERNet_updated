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
import Icon from "../../components/Icon";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  ProgressBar,
  StatTile,
} from "../../components/ui";
import { BrandLoader } from "../../brand";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import type { ReportSection } from "../../lib/analyticsPdf";
import { formatDate, formatDateTime, formatHours } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

type TrendDay = { day: string; logs: number; hours: number; students: number };

type AnalyticsData = {
  days: number;
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

// Tells spreadsheet programs the file is UTF-8, so accented names open correctly.
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** Guards a spreadsheet cell against being read as a formula. */
function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** "Oct 6" for a "YYYY-MM-DD" day; falls back to the raw value. */
function dayLabel(day: string): string {
  const label = formatDate(day);
  return label === "—" ? day : label.replace(/, \d{4}$/, "");
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * The columns of the hours chart. Up to a month is drawn day by day; a
 * longer period is added up by week, or the columns would be hairlines.
 */
function trendColumns(days: TrendDay[]): { points: ColumnPoint[]; byWeek: boolean } {
  if (days.length <= 31) {
    return {
      byWeek: false,
      points: days.map((day) => ({
        key: day.day,
        label: dayLabel(day.day),
        value: day.hours,
        detail:
          day.logs === 0
            ? "No attendance logged"
            : `${plural(day.logs, "log")} from ${plural(day.students, "student")}`,
      })),
    };
  }
  const points: ColumnPoint[] = [];
  for (let start = 0; start < days.length; start += 7) {
    const week = days.slice(start, start + 7);
    const logs = week.reduce((sum, day) => sum + day.logs, 0);
    points.push({
      key: week[0].day,
      label: dayLabel(week[0].day),
      value: week.reduce((sum, day) => sum + day.hours, 0),
      detail: `${dayLabel(week[0].day)} to ${dayLabel(week[week.length - 1].day)} · ${plural(logs, "log")}`,
    });
  }
  return { byWeek: true, points };
}

// One definition of the report's tables, shared by the CSV and PDF exports.
function reportSections(report: AnalyticsData): ReportSection[] {
  const { period, progress } = report;
  return [
    {
      title: `Attendance in the last ${report.days} days`,
      head: ["Measure", "Value"],
      rows: [
        ["Verified hours", period.hours],
        [`Verified hours, previous ${report.days} days`, period.previousHours],
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
      title: `Verified hours per day (last ${report.days} days)`,
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
        "Complaints",
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
      title: "Complaints by category",
      head: ["Category", "Complaints", "Still open"],
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

const reportFileName = (extension: string) =>
  `internet-analytics-${new Date().toISOString().slice(0, 10)}.${extension}`;

export default function CoordinatorAnalytics() {
  const [days, setDays] = useState<Period>(14);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  // True while a different period is being fetched; the old figures stay up.
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [buildingPdf, setBuildingPdf] = useState(false);

  const load = useCallback(async (period: Period) => {
    try {
      setData(await coordinatorRequest<AnalyticsData>(`/api/coordinator/analytics?days=${period}`));
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load analytics."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load(days));
  }, [load, days]);

  const choosePeriod = (period: Period) => {
    if (period === days) return;
    setRefreshing(true);
    setDays(period);
  };

  const downloadPdf = async () => {
    if (!data) return;
    setBuildingPdf(true);
    try {
      // Loaded on demand so the PDF library is not part of every page load.
      const { buildAnalyticsPdf } = await import("../../lib/analyticsPdf");
      buildAnalyticsPdf(reportSections(data), new Date().toLocaleString()).save(
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

  const downloadCsv = () => {
    if (!data) return;
    const rows: (string | number)[][] = [
      ["INTERNet Coordinator Analytics Report"],
      ["Generated at", new Date().toLocaleString()],
      ...reportSections(data).flatMap((section) => [
        [],
        [section.title],
        section.head,
        ...section.rows,
      ]),
    ];
    const csv = `${BYTE_ORDER_MARK}${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = reportFileName("csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const trend = useMemo(
    () => (data ? trendColumns(data.attendanceTrend) : { points: [], byWeek: false }),
    [data]
  );

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
            <Button variant="secondary" icon="download" onClick={downloadCsv}>
              CSV
            </Button>
            <Button icon="download" busy={buildingPdf} doneLabel="Ready" busyProcess="export" onClick={() => void downloadPdf()}>
              {buildingPdf ? "Preparing" : "PDF report"}
            </Button>
          </>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-5">
          <ErrorNotice message={error} onRetry={() => void load(days)} />
        </div>
      )}

      {data && (
        <p className="mb-4 hidden text-sm text-slate-600 print:block">
          INTERNet OJT analytics report, generated {formatDateTime(new Date())}. Attendance
          figures cover the last {data.days} days; all other figures are to date. Active
          students only.
        </p>
      )}

      {loading ? (
        <BrandLoader variant="page" role="coordinator" process="analytics" />
      ) : (
        data && (
          <div
            className={`space-y-8 transition-opacity duration-200 ${refreshing ? "opacity-60" : ""}`}
            aria-busy={refreshing}
          >
            {/* ATTENDANCE: follows the period chosen here. */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionTitle
                  title="Attendance"
                  note={`The last ${data.days} days, active students only.`}
                />
                <div
                  role="tablist"
                  aria-label="Period for the attendance figures"
                  className="inline-flex rounded-lg bg-slate-100 p-1 ring-1 ring-inset ring-slate-200/70 print:hidden"
                >
                  {PERIODS.map((period) => (
                    <button
                      key={period}
                      type="button"
                      role="tab"
                      aria-selected={period === days}
                      onClick={() => choosePeriod(period)}
                      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                        period === days
                          ? "bg-white text-psu-800 shadow-sm ring-1 ring-psu-600/10"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {period} days
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                  label="Verified hours"
                  value={formatHours(data.period.hours)}
                  hint={
                    <Change
                      current={data.period.hours}
                      previous={data.period.previousHours}
                      versus={`the previous ${data.days} days`}
                    />
                  }
                  icon="clock"
                  tone="gold"
                />
                <StatTile
                  label="Attendance logs"
                  value={data.period.logs}
                  hint={
                    <Change
                      current={data.period.logs}
                      previous={data.period.previousLogs}
                      versus={`the previous ${data.days} days`}
                    />
                  }
                  icon="calendar"
                />
                <StatTile
                  label="Students who logged"
                  value={`${data.period.studentsLogged} of ${data.progress.students}`}
                  hint={
                    data.progress.students > 0
                      ? `${Math.round((data.period.studentsLogged / data.progress.students) * 100)}% of active students`
                      : "No active students"
                  }
                  icon="users"
                />
                <StatTile
                  label="Logs verified"
                  value={
                    data.period.logs > 0
                      ? `${Math.round((data.period.verified / data.period.logs) * 100)}%`
                      : "–"
                  }
                  hint={
                    data.period.logs > 0
                      ? `${data.period.pending} waiting · ${data.period.rejected} rejected`
                      : "No logs in this period"
                  }
                  icon="check-circle"
                  tone={data.period.pending + data.period.rejected > 0 ? "waiting" : "good"}
                />
              </div>

              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
                <Card className="min-w-0 lg:col-span-2">
                  <CardHeader
                    title={trend.byWeek ? "Verified hours per week" : "Verified hours per day"}
                    description={
                      trend.byWeek
                        ? "Each column is seven days, labelled by its first day"
                        : "Days with no column had no verified hours"
                    }
                  />
                  <div className="px-4 pb-4 pt-6 sm:px-5">
                    {data.period.hours === 0 && data.period.logs === 0 ? (
                      <p className="py-10 text-center text-sm text-slate-500">
                        No attendance was logged in the last {data.days} days.
                      </p>
                    ) : (
                      <ColumnChart
                        points={trend.points}
                        label={`Verified hours per ${trend.byWeek ? "week" : "day"} over the last ${data.days} days`}
                        format={(value) => formatHours(value)}
                      />
                    )}
                    <ChartTable
                      head={["Date", "Verified hours", "Logs", "Students"]}
                      rows={data.attendanceTrend.map((day) => [
                        dayLabel(day.day),
                        formatHours(day.hours),
                        day.logs,
                        day.students,
                      ])}
                    />
                  </div>
                </Card>

                <Card className="min-w-0">
                  <CardHeader
                    title="Review of these logs"
                    description={plural(data.period.logs, "log") + " in this period"}
                  />
                  <div className="px-4 pb-5 pt-4 sm:px-5">
                    {data.period.logs === 0 ? (
                      <p className="py-6 text-center text-sm text-slate-500">Nothing to review.</p>
                    ) : (
                      <>
                        <ShareBar
                          label="Attendance logs by review status"
                          segments={[
                            { label: "Verified", value: data.period.verified, color: "#10b981" },
                            {
                              label: "Waiting for a supervisor",
                              value: data.period.pending,
                              color: "#f59e0b",
                            },
                            { label: "Rejected", value: data.period.rejected, color: "#ef4444" },
                          ]}
                        />
                        <p className="mt-5 border-t border-slate-100 pt-4 text-xs font-medium text-slate-500">
                          How the time-in photos were taken
                        </p>
                        <dl className="mt-2 space-y-2 text-sm">
                          <PhotoSource
                            label="Camera check"
                            count={data.period.capture.cameraChecked}
                          />
                          <PhotoSource
                            label="Supervisor, in person"
                            count={data.period.capture.bySupervisor}
                          />
                          <PhotoSource
                            label="Not camera-checked"
                            count={data.period.capture.unchecked}
                          />
                        </dl>
                      </>
                    )}
                  </div>
                </Card>
              </div>
            </section>

            {/* PROGRAMME: totals to date. */}
            <section className="space-y-4">
              <SectionTitle
                title="Programme to date"
                note="All verified work so far, active students only."
              />

              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                <Card className="min-w-0">
                  <CardHeader
                    title="Progress toward required hours"
                    description={`${plural(data.progress.students, "active student")} · ${
                      data.progress.averageCompletion
                    }% complete on average`}
                  />
                  <div className="px-4 pb-4 pt-7 sm:px-5">
                    {data.progress.students === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-500">
                        No active students yet.
                      </p>
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
                    <ChartTable
                      head={["Progress", "Students"]}
                      rows={data.progress.bands.map((band) => [band.label, band.count])}
                    />
                  </div>
                </Card>

                <Card className="min-w-0">
                  <TaskStatus stages={data.taskFunnel} />
                </Card>
              </div>

              <Card className="min-w-0">
                <CardHeader
                  title="Partner companies"
                  description="How interns at each company are progressing, and what they and others have reported"
                />
                <CompanyTable companies={data.companies} />
              </Card>

              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                <Card className="min-w-0">
                  <CardHeader
                    title="Complaints by category"
                    description={(() => {
                      const total = data.complaintsByCategory.reduce((sum, row) => sum + row.count, 0);
                      const open = data.complaintsByCategory.reduce((sum, row) => sum + row.open, 0);
                      return total === 0
                        ? undefined
                        : `${plural(total, "complaint")} filed · ${open} still open`;
                    })()}
                    action={
                      <Link
                        to="/coordinator/complaints"
                        className="inline-flex items-center gap-1 text-sm font-semibold text-psu-700 hover:underline print:hidden"
                      >
                        Open
                        <Icon name="chevron-right" size={14} />
                      </Link>
                    }
                  />
                  {data.complaintsByCategory.length === 0 ? (
                    <EmptyState icon="flag" title="No complaints have been filed" />
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
                  <CardHeader
                    title="Evaluation averages"
                    description="Average rating out of 5, by who gave it"
                  />
                  {data.evaluationSummary.length === 0 ? (
                    <EmptyState icon="star" title="No evaluations submitted yet" />
                  ) : (
                    <div className="space-y-5 px-4 pb-5 pt-4 sm:px-5">
                      {EVALUATORS.map((group) => {
                        const rows = data.evaluationSummary.filter(
                          (item) => item.evaluatorType === group.type
                        );
                        if (rows.length === 0) return null;
                        return (
                          <div key={group.type}>
                            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                              {group.label}
                            </p>
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

function SectionTitle({ title, note }: { title: string; note: string }) {
  return (
    <div className="min-w-0">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500">{note}</p>
    </div>
  );
}

function PhotoSource({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-700">{label}</dt>
      <dd className="tabular font-semibold text-slate-900">{count}</dd>
    </div>
  );
}

function TaskStatus({ stages }: { stages: AnalyticsData["taskFunnel"] }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  const overdue = stages.reduce((sum, stage) => sum + stage.overdue, 0);
  return (
    <>
      <CardHeader
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
      <span className="text-slate-400">No ratings</span>
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
              <span>{plural(company.complaints, "complaint")}</span>
            </p>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="table-head border-y border-slate-100 text-xs text-slate-500">
              <th scope="col" className="px-5 py-3 font-medium">Company</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Interns</th>
              <th scope="col" className="w-56 px-3 py-3 font-medium">Average progress</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Verified hours</th>
              <th scope="col" className="px-3 py-3 font-medium">Student rating</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">Complaints</th>
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
                    company.complaints > 0 ? "font-semibold text-slate-900" : "text-slate-400"
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
