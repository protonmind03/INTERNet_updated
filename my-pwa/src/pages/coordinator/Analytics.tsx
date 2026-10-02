import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CoordinatorLayout from "./CoordinatorLayout";
import { API_URL, withCoordinatorAuth } from "../../lib/api";
import type { ReportSection } from "../../lib/analyticsPdf";

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

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[\s]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function BarRow({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-medium text-slate-700">{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function CoordinatorAnalytics() {
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [buildingPdf, setBuildingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${API_URL}/api/coordinator/analytics`,
          withCoordinatorAuth()
        );

        if (response.status === 401) {
          navigate("/");
          return;
        }

        const result = await response.json();

        if (!response.ok) {
          setError(result.message || "Failed to load analytics.");
          return;
        }

        setData(result);
      } catch {
        setError("Unable to connect to the server.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate]);

  const maxHours = data
    ? Math.max(1, ...data.attendanceTrend.map((d) => d.hours))
    : 1;

  const maxCompany = data
    ? Math.max(1, ...data.studentsByCompany.map((d) => Number(d.student_count)))
    : 1;

  const maxComplaint = data
    ? Math.max(1, ...data.complaintsByCategory.map((d) => Number(d.count)))
    : 1;

  const taskColors: Record<string, string> = {
    Pending: "bg-slate-400",
    "In Progress": "bg-blue-400",
    Submitted: "bg-amber-400",
    Reviewed: "bg-emerald-500",
  };

  const totalTasks = data
    ? data.taskFunnel.reduce((sum, t) => sum + Number(t.count), 0)
    : 0;

  // One definition of the report's tables, shared by the CSV and PDF exports.
  const reportSections = (report: AnalyticsData): ReportSection[] => [
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
      head: [
        "Evaluator role",
        "Category",
        "Evaluation count",
        "Average rating (1-5)",
      ],
      rows: report.evaluationSummary.map((evaluation) => [
        evaluation.evaluatorType,
        evaluation.category,
        evaluation.count,
        evaluation.averageRating,
      ]),
    },
  ];

  const reportFileName = (extension: string) =>
    `internet-analytics-${new Date().toISOString().slice(0, 10)}.${extension}`;

  const downloadPdf = async () => {
    if (!data) return;
    setPdfError("");
    setBuildingPdf(true);
    try {
      // Loaded on demand so the PDF library is not part of every page load.
      const { buildAnalyticsPdf } = await import("../../lib/analyticsPdf");
      buildAnalyticsPdf(
        reportSections(data),
        new Date().toLocaleString()
      ).save(reportFileName("pdf"));
    } catch (pdfBuildError) {
      console.error("ANALYTICS PDF ERROR:", pdfBuildError);
      setPdfError("The PDF could not be generated. Try again.");
    } finally {
      setBuildingPdf(false);
    }
  };

  const exportReport = () => {
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

    const csv = `\uFEFF${rows
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = reportFileName("csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <CoordinatorLayout
      title="Data Analytics & Reports"
      subtitle="Visual summaries to support decisions on training and partner companies"
      breadcrumb={["Coordinator", "Overview", "Analytics"]}
    >
      {!loading && !error && data && (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Print
          </button>
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={buildingPdf}
            className="rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
          >
            {buildingPdf ? "Preparing PDF..." : "Download PDF report"}
          </button>
          <button
            type="button"
            onClick={exportReport}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Export CSV report
          </button>
        </div>
      )}

      {pdfError && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 print:hidden">
          {pdfError}
        </p>
      )}

      {!loading && !error && data && (
        <p className="mb-4 hidden text-xs text-slate-500 print:block">
          INTERNet OJT analytics report · generated{" "}
          {new Date().toLocaleString()}
        </p>
      )}

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          Loading analytics...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-white p-10 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* ATTENDANCE TREND */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-800">
              Verified Hours — Last 14 Days
            </p>
            <div className="mt-4 flex h-32 items-end gap-1.5">
              {data.attendanceTrend.map((d) => (
                <div
                  key={d.day}
                  className="flex-1 rounded-t bg-indigo-500"
                  style={{
                    height: `${Math.max(4, (d.hours / maxHours) * 100)}%`,
                  }}
                  title={`${d.day}: ${d.hours}h`}
                />
              ))}
              {data.attendanceTrend.length === 0 && (
                <p className="text-xs text-slate-400">
                  No attendance data yet.
                </p>
              )}
            </div>
          </div>

          {/* TASK FUNNEL */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-800">
              Task Completion Funnel
            </p>
            <p className="text-xs text-slate-400">{totalTasks} total tasks</p>
            <div className="mt-4 space-y-3">
              {data.taskFunnel.length === 0 && (
                <p className="text-xs text-slate-400">No tasks yet.</p>
              )}
              {data.taskFunnel.map((t) => (
                <BarRow
                  key={t.status}
                  label={t.status}
                  value={Number(t.count)}
                  max={totalTasks}
                  color={taskColors[t.status] || "bg-slate-400"}
                />
              ))}
            </div>
          </div>

          {/* STUDENTS BY COMPANY */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-800">
              Students by Partner Company
            </p>
            <div className="mt-4 space-y-3">
              {data.studentsByCompany.length === 0 && (
                <p className="text-xs text-slate-400">
                  No company data yet.
                </p>
              )}
              {data.studentsByCompany.map((c) => (
                <BarRow
                  key={c.company}
                  label={c.company}
                  value={Number(c.student_count)}
                  max={maxCompany}
                  color="bg-indigo-500"
                />
              ))}
            </div>
          </div>

          {/* COMPLAINTS BY CATEGORY */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-800">
              Complaints by Category
            </p>
            <div className="mt-4 space-y-3">
              {data.complaintsByCategory.length === 0 && (
                <p className="text-xs text-slate-400">
                  No complaints filed yet.
                </p>
              )}
              {data.complaintsByCategory.map((c) => (
                <BarRow
                  key={c.category}
                  label={c.category}
                  value={Number(c.count)}
                  max={maxComplaint}
                  color="bg-red-400"
                />
              ))}
            </div>

            {/* EVALUATIONS */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">
                Evaluation & Feedback Summary
              </p>
              <div className="mt-4 space-y-3">
                {data.evaluationSummary.length === 0 && (
                  <p className="text-xs text-slate-400">
                    No evaluations submitted yet.
                  </p>
                )}
                {data.evaluationSummary.map((evaluation) => (
                  <div
                    key={`${evaluation.evaluatorType}-${evaluation.category}`}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-medium text-slate-700">
                        {evaluation.category}
                      </p>
                      <p className="text-slate-400">
                        {evaluation.evaluatorType} · {evaluation.count}{" "}
                        {evaluation.count === 1 ? "evaluation" : "evaluations"}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold text-indigo-600">
                      {evaluation.averageRating.toFixed(2)} / 5
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </CoordinatorLayout>
  );
}
