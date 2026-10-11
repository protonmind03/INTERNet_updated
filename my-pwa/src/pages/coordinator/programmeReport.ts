import type { ReportSection } from "../../lib/analyticsPdf";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| THE PROGRAMME REPORT, AS TABLES
|--------------------------------------------------------------------------
|
| Students with their hours and projected finish, and companies summed
| from them, as the server works them out (optionally for one term). The
| same two tables go into the Monitoring export and the Analytics report.
|
*/

type ReportStudent = {
  student_id: string;
  name: string;
  program: string | null;
  company: string | null;
  supervisor: string | null;
  term: string | null;
  required_hours: number;
  verified_hours: number;
  remaining_hours: number;
  completion: number;
  weekly_hours: number;
  projected_finish: string | null;
  at_risk: boolean;
  risk_reason: string;
};

type ReportCompany = {
  company: string;
  students: number;
  verified_hours: number;
  required_hours: number;
  average_completion: number;
  completed: number;
  at_risk: number;
  moa_expiry: string | null;
  last_visit: string | null;
};

export type ProgrammeReport = { students: ReportStudent[]; companies: ReportCompany[] };

export function fetchProgrammeReport(term = ""): Promise<ProgrammeReport> {
  return coordinatorRequest<ProgrammeReport>(
    `/api/coordinator/report${term ? `?term=${encodeURIComponent(term)}` : ""}`
  );
}

export function programmeSections(report: ProgrammeReport): ReportSection[] {
  return [
    {
      title: "Students: hours and projected finish",
      head: [
        "Student ID",
        "Name",
        "Program",
        "Company",
        "Supervisor",
        "Term",
        "Required hours",
        "Verified hours",
        "Remaining hours",
        "Complete (%)",
        "Scheduled hours a week",
        "Projected finish",
        "At risk",
        "Why",
      ],
      rows: report.students.map((row) => [
        row.student_id,
        row.name,
        row.program || "",
        row.company || "",
        row.supervisor || "",
        row.term || "",
        row.required_hours,
        row.verified_hours,
        row.remaining_hours,
        row.completion,
        row.weekly_hours,
        row.remaining_hours === 0 ? "Finished" : row.projected_finish || "",
        row.at_risk ? "Yes" : "No",
        row.risk_reason,
      ]),
    },
    {
      title: "Companies: summary",
      head: [
        "Company",
        "Active students",
        "Verified hours",
        "Required hours",
        "Average complete (%)",
        "Students finished",
        "Students at risk",
        "Agreement ends",
        "Last visited",
      ],
      rows: report.companies.map((row) => [
        row.company,
        row.students,
        row.verified_hours,
        row.required_hours,
        row.average_completion,
        row.completed,
        row.at_risk,
        row.moa_expiry || "",
        row.last_visit || "",
      ]),
    },
  ];
}

/** Guards a spreadsheet cell against being read as a formula. */
function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Saves titled tables as one CSV file that spreadsheet programs open as UTF-8. */
export function downloadSectionsCsv(
  fileName: string,
  heading: (string | number)[][],
  sections: ReportSection[]
): void {
  const rows: (string | number)[][] = [
    ...heading,
    ...sections.flatMap((section) => [[], [section.title], section.head, ...section.rows]),
  ];
  const csv = `${String.fromCharCode(0xfeff)}${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
