import type { ReportSection } from "../../lib/analyticsPdf";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| THE PROGRAMME REPORT, AS TABLES
|--------------------------------------------------------------------------
|
| Students with their hours and projected finish, and the same students
| summed by company, by program and by block, as the server works them out
| for the students the coordinator's filters leave. The same tables go into
| the Monitoring export and the Analytics report.
|
*/

type ReportStudent = {
  student_id: string;
  name: string;
  program: string | null;
  college: string | null;
  program_code: string | null;
  major: string | null;
  block: string | null;
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

/** Students summed under one heading: a program, or a block. */
export type ReportGroup = {
  name: string;
  students: number;
  verified_hours: number;
  required_hours: number;
  average_completion: number;
  completed: number;
  at_risk: number;
};

export type ProgrammeReport = {
  students: ReportStudent[];
  companies: ReportCompany[];
  /** Missing from a server older than the program records. */
  programs?: ReportGroup[];
  blocks?: ReportGroup[];
};

/** `query` is the coordinator's filters as sent to the server: "term=3&program=7". */
export function fetchProgrammeReport(query = ""): Promise<ProgrammeReport> {
  return coordinatorRequest<ProgrammeReport>(`/api/coordinator/report${query ? `?${query}` : ""}`);
}

const GROUP_HEAD = [
  "Active students",
  "Verified hours",
  "Required hours",
  "Average complete (%)",
  "Students finished",
  "Students at risk",
];

const groupRows = (groups: ReportGroup[]) =>
  groups.map((row) => [
    row.name,
    row.students,
    row.verified_hours,
    row.required_hours,
    row.average_completion,
    row.completed,
    row.at_risk,
  ]);

export function programmeSections(report: ProgrammeReport): ReportSection[] {
  return [
    {
      title: "Students: hours and projected finish",
      head: [
        "Student ID",
        "Name",
        "College",
        "Program",
        "Program code",
        "Major",
        "Block",
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
        row.college || "",
        row.program || "",
        row.program_code || "",
        row.major || "",
        row.block || "",
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
    // The company table's twins: the same students, by program and by block.
    {
      title: "Programs: summary",
      head: ["Program", ...GROUP_HEAD],
      rows: groupRows(report.programs || []),
    },
    {
      title: "Blocks: summary",
      head: ["Block", ...GROUP_HEAD],
      rows: groupRows(report.blocks || []),
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
