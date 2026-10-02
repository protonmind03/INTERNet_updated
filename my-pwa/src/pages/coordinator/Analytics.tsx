import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  Skeleton,
  Stars,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import type { ReportSection } from "../../lib/analyticsPdf";
import { formatDate, formatDateTime, formatHours } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

type AnalyticsData = {
  studentsByCompany: { company: string; student_count: string }[];
  complaintsByCategory: { category: string; count: string }[];
  taskFunnel: { status: string; count: string }[];
  attendanceTrend: { day: string; logs: number; hours: number }[];
  evaluationSummary: {
    evaluatorType: string;
    category: string;
    count: number;
    averageRating: number;
  }[];
};

const TASK_STATUS_LABELS: Record<string, string> = {
  Pending: "Not started",
  "In Progress": "Sent back for changes",
  Submitted: "Waiting for review",
  Reviewed: "Reviewed",
};

const EVALUATOR_LABELS: Record<string, string> = {
  supervisor: "Supervisors, about students",
  teacher: "Coordinator, about students",
  student: "Students, about their company",
};

// Tells spreadsheet programs the file is UTF-8, so accented names open correctly.
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** Guards a spreadsheet cell against being read as a formula. */
function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** The label for a day on the trend chart; falls back to the raw value. */
function dayLabel(day: string): string {
  const label = formatDate(day);
  return label === "—" ? day : label.replace(/, \d{4}$/, "");
}

// One definition of the report's tables, shared by the CSV and PDF exports.
function reportSections(report: AnalyticsData): ReportSection[] {
  return [
    {
      title: "Attendance trend (last 14 days)",
      head: ["Date", "Attendance logs", "Verified hours"],
      rows: report.attendanceTrend.map((day) => [day.day, day.logs, day.hours]),
    },
    {
      title: "Task status",
      head: ["Status", "Task count"],
      rows: report.taskFunnel.map((task) => [task.status, Number(task.count)]),
    },
    {
      title: "Active students by partner company",
      head: ["Company", "Active student count"],
      rows: report.studentsByCompany.map((company) => [
        company.company,
        Number(company.student_count),
      ]),
    },
    {
      title: "Complaints by category",
      head: ["Category", "Complaint count"],
      rows: report.complaintsByCategory.map((complaint) => [
        complaint.category,
        Number(complaint.count),
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
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [buildingPdf, setBuildingPdf] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await coordinatorRequest<AnalyticsData>("/api/coordinator/analytics"));
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load analytics."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const downloadPdf = async () => {
    if (!data) return;
    setBuildingPdf(true);
    try {
      // Loaded on demand so the PDF library is not part of every page load.
      const { buildAnalyticsPdf } = await import("../../lib/analyticsPdf");
      buildAnalyticsPdf(reportSections(data), new Date().toLocaleString()).save(
        reportFileName("pdf")
      );
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

  const totalTasks = data
    ? data.taskFunnel.reduce((sum, task) => sum + Number(task.count), 0)
    : 0;
  const totalHours = data ? data.attendanceTrend.reduce((sum, day) => sum + day.hours, 0) : 0;

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
            <Button icon="download" busy={buildingPdf} onClick={() => void downloadPdf()}>
              {buildingPdf ? "Preparing" : "PDF report"}
            </Button>
          </>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-5">
          <ErrorNotice message={error} onRetry={() => void load()} />
        </div>
      )}

      {data && (
        <p className="mb-4 hidden text-sm text-slate-600 print:block">
          INTERNet OJT analytics report, generated {formatDateTime(new Date())}
        </p>
      )}

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {[0, 1, 2, 3].map((card) => (
            <Skeleton key={card} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : (
        data && (
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Verified hours per day"
                description="Last 14 days, all students"
                action={
                  <p className="text-sm text-slate-500">
                    <span className="font-semibold text-slate-900">
                      {formatHours(totalHours)}
                    </span>{" "}
                    total
                  </p>
                }
              />
              <div className="px-4 pb-5 pt-5 sm:px-5">
                <TrendChart days={data.attendanceTrend} />
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Task status"
                description={`${totalTasks} ${totalTasks === 1 ? "task" : "tasks"} assigned in total`}
              />
              <BarList
                empty="No tasks have been assigned yet."
                rows={data.taskFunnel.map((task) => ({
                  label: TASK_STATUS_LABELS[task.status] || task.status,
                  value: Number(task.count),
                }))}
              />
            </Card>

            <Card>
              <CardHeader title="Students by partner company" description="Active students" />
              <BarList
                empty="No students are placed with a company yet."
                rows={data.studentsByCompany.map((company) => ({
                  label: company.company || "No company set",
                  value: Number(company.student_count),
                }))}
              />
            </Card>

            <Card>
              <CardHeader title="Complaints by category" />
              <BarList
                empty="No complaints have been filed."
                rows={data.complaintsByCategory.map((complaint) => ({
                  label: complaint.category,
                  value: Number(complaint.count),
                }))}
              />
            </Card>

            <Card>
              <CardHeader title="Evaluation averages" description="Average rating out of 5" />
              {data.evaluationSummary.length === 0 ? (
                <EmptyState icon="star" title="No evaluations submitted yet" />
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                  {data.evaluationSummary.map((evaluation) => (
                    <li
                      key={`${evaluation.evaluatorType}-${evaluation.category}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {evaluation.category}
                        </p>
                        <p className="text-xs text-slate-500">
                          {EVALUATOR_LABELS[evaluation.evaluatorType] || evaluation.evaluatorType}{" "}
                          · {evaluation.count}{" "}
                          {evaluation.count === 1 ? "evaluation" : "evaluations"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Stars value={evaluation.averageRating} />
                        <span className="tabular w-8 text-right text-sm font-semibold text-slate-900">
                          {Number(evaluation.averageRating).toFixed(1)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )
      )}
    </CoordinatorLayout>
  );
}

/*
|--------------------------------------------------------------------------
| CHARTS
|--------------------------------------------------------------------------
|
| Each chart shows one series, so it uses one colour and needs no legend.
| Values are printed beside the bars, and hovering a column gives its date.
|
*/

function TrendChart({ days }: { days: AnalyticsData["attendanceTrend"] }) {
  if (days.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No verified attendance in the last 14 days.
      </p>
    );
  }
  const max = Math.max(1, ...days.map((day) => day.hours));
  const peak = days.reduce((best, day) => (day.hours > best.hours ? day : best), days[0]);

  return (
    <div>
      <div className="flex h-44 items-end gap-1 border-b border-slate-200 sm:gap-2">
        {days.map((day) => (
          <div
            key={day.day}
            className="group flex h-full flex-1 flex-col items-center justify-end"
            title={`${dayLabel(day.day)}: ${formatHours(day.hours)} from ${day.logs} ${
              day.logs === 1 ? "log" : "logs"
            }`}
          >
            {/* Only the busiest day is labelled; the rest are on hover. */}
            <span className="tabular mb-1 h-4 text-xs font-medium text-slate-700">
              {day === peak && day.hours > 0 ? Number(day.hours.toFixed(1)) : ""}
            </span>
            <div
              className="w-full max-w-6 rounded-t bg-psu-600 transition-colors group-hover:bg-psu-800"
              style={{ height: `${Math.round((day.hours / max) * 140)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{dayLabel(days[0].day)}</span>
        {days.length > 1 && <span>{dayLabel(days[days.length - 1].day)}</span>}
      </div>
    </div>
  );
}

function BarList({ rows, empty }: { rows: { label: string; value: number }[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-slate-500">{empty}</p>;
  }
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="space-y-3.5 px-4 pb-5 pt-4 sm:px-5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{row.label}</span>
            <span className="tabular shrink-0 font-semibold text-slate-900">{row.value}</span>
          </div>
          <div className="mt-1.5 h-2.5 w-full rounded-r-sm bg-slate-100">
            <div
              className="h-full rounded-r bg-psu-600"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
