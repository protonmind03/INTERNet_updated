import { API_URL, withSupervisorAuth } from "../../lib/api";
import type { ReportSection } from "../../lib/analyticsPdf";
import { formatDate, formatTime } from "../../lib/format";
import type { FinalEvaluation } from "../../lib/useFinalEvaluation";
import type { Projection } from "../../lib/useProjections";
import type { AttendanceEntry, DocumentEntry, Intern, TaskEntry } from "./useSupervisorWork";

/*
|--------------------------------------------------------------------------
| ONE INTERN'S SUMMARY, AS TABLES FOR A PDF
|--------------------------------------------------------------------------
|
| Everything the supervisor holds about one intern on a few pages: hours,
| every attendance log, tasks, documents and, when there is one, the final
| evaluation. Made from what the page already has loaded, so it says what
| the screen says.
|
*/

const hours = (value: number | string | null) =>
  value === null || value === "" ? "" : String(Math.round(Number(value) * 100) / 100);

export function internSummarySections(input: {
  intern: Intern;
  logs: AttendanceEntry[];
  tasks: TaskEntry[];
  documents: DocumentEntry[];
  projection?: Projection;
  evaluation: FinalEvaluation | null;
}): ReportSection[] {
  const { intern, logs, tasks, documents, projection, evaluation } = input;
  const verified = logs.filter((log) => log.status === "Verified");
  const count = (status: string) => logs.filter((log) => log.status === status).length;

  const sections: ReportSection[] = [
    {
      title: "Intern",
      head: ["", ""],
      rows: [
        ["Name", intern.name],
        ["Student ID", intern.student_id],
        ["Program", intern.program || ""],
        ["Company", intern.company || ""],
        ["Required hours", intern.required_hours],
        ["Verified hours", hours(intern.hours_rendered)],
        ["Complete", `${intern.completion}%`],
        [
          "Projected finish",
          !projection
            ? ""
            : projection.remaining_hours === 0
              ? "Finished"
              : projection.projected_finish
                ? formatDate(projection.projected_finish)
                : projection.risk_reason,
        ],
      ],
    },
    {
      title: "Attendance",
      head: ["Measure", "Value"],
      rows: [
        ["Days logged", logs.length],
        ["Verified", verified.length],
        ["Waiting for a decision", count("Pending")],
        ["Rejected", count("Rejected") + count("Flagged")],
        ["Logs with a corrected time", logs.filter((log) => log.time_correction_reason).length],
      ],
    },
    {
      title: "Attendance logs",
      head: ["Date", "Time in", "Time out", "Hours", "Status", "What was done"],
      rows: [...logs]
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .map((log) => [
          formatDate(log.date),
          formatTime(log.time_in),
          log.time_out ? formatTime(log.time_out) : "",
          hours(log.hours),
          log.status,
          log.accomplishments || "",
        ]),
    },
    {
      title: "Tasks",
      head: ["Task", "Status", "Due", "Rating", "Your feedback"],
      rows: tasks.map((task) => [
        task.title,
        task.status === "Pending" ? "To do" : task.status,
        task.due_date ? formatDate(task.due_date) : "",
        task.review_rating ? `${task.review_rating} of 5` : "",
        task.review_notes || "",
      ]),
    },
    {
      title: "Documents",
      head: ["Document", "File", "Status", "Uploaded"],
      rows: documents.map((item) => [
        item.doc_type,
        item.original_filename,
        item.status,
        formatDate(item.uploaded_at),
      ]),
    },
  ];

  if (evaluation) {
    const { criteria, scale_max: scale } = evaluation.form_snapshot;
    sections.push({
      title: `Final evaluation: ${evaluation.average} out of ${scale} on average`,
      head: ["Criterion", "Rating"],
      rows: [
        ...criteria.map((criterion) => [
          criterion.label,
          `${evaluation.ratings[criterion.key] ?? ""} of ${scale}`,
        ]),
        ["Remarks", evaluation.remarks],
      ],
    });
  }
  return sections;
}

/** The intern's final evaluation, or null when there is none or it cannot be read. */
export async function fetchFinalEvaluation(studentId: string): Promise<FinalEvaluation | null> {
  try {
    const response = await fetch(
      `${API_URL}/api/final-evaluations/${encodeURIComponent(studentId)}`,
      withSupervisorAuth()
    );
    if (!response.ok) return null;
    return ((await response.json()) as { evaluation: FinalEvaluation | null }).evaluation;
  } catch {
    return null;
  }
}
