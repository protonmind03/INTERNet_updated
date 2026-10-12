import type { ReportSection } from "../../lib/analyticsPdf";
import { coordinatorRequest } from "./request";

/*
|--------------------------------------------------------------------------
| STUDENT PERFORMANCE (the coordinator's reading of it)
|--------------------------------------------------------------------------
|
| The figures, the status word and the sentence all come from the server
| (backend/src/services/performance.ts), where the rules are. This file
| only names their shape and lays them out for a table or a file. Nothing
| here decides a status.
|
*/

export type PerformanceStatus = "Completed" | "On track" | "Behind" | "At risk";

export type Performance = {
  attendance: { scheduled_days: number; attended_days: number; rate: number | null };
  late_time_ins: number;
  logs_rejected: number;
  logs_corrected: number;
  tasks: { assigned: number; on_time: number; late: number; average_rating: number | null };
  weekly_reports: { submitted: number; weeks_worked: number };
  requirements: { approved: number; required: number };
  supervisor_rating: number | null;
  final_evaluation: { average: number; scale: number } | null;
  concerns: number;
  status: PerformanceStatus;
  summary: string;
};

export type PerformanceStudent = {
  student_id: string;
  name: string;
  company: string | null;
  required_hours: number;
  verified_hours: number;
  remaining_hours: number;
  projected_finish: string | null;
  block?: string | null;
  program_code?: string | null;
  program?: string | null;
  performance: Performance;
};

export type PerformanceRules = {
  rules: { status: PerformanceStatus; rule: string }[];
  thresholds: { late_after_minutes: number };
};

export const STATUS_TONE: Record<PerformanceStatus, "good" | "info" | "waiting" | "bad"> = {
  Completed: "good",
  "On track": "info",
  Behind: "waiting",
  "At risk": "bad",
};

/** How serious each word is, for sorting: the ones to look at first come first. */
export const STATUS_ORDER: Record<PerformanceStatus, number> = {
  "At risk": 0,
  Behind: 1,
  "On track": 2,
  Completed: 3,
};

export const fetchPerformance = (query: string) =>
  coordinatorRequest<PerformanceRules & { students: PerformanceStudent[] }>(
    `/api/coordinator/performance${query ? `?${query}` : ""}`
  );

export const fetchStudentPerformance = (studentId: string) =>
  coordinatorRequest<PerformanceRules & { student: PerformanceStudent | null }>(
    `/api/coordinator/students/${encodeURIComponent(studentId)}/performance`
  );

const blank = (value: number | null | undefined) => (value === null || value === undefined ? "" : value);

/** The table as a file's rows: every figure in a column of its own, then the sentence. */
export function performanceSection(students: PerformanceStudent[]): ReportSection {
  return {
    title: "Student performance",
    head: [
      "Student ID",
      "Student",
      "Block",
      "Status",
      "Verified hours",
      "Required hours",
      "Projected finish",
      "Attendance on scheduled days (%)",
      "Scheduled days",
      "Late time-ins",
      "Logs rejected",
      "Logs with corrected times",
      "Tasks assigned",
      "Tasks on time",
      "Tasks late",
      "Average task rating (1-5)",
      "Weekly reports",
      "Weeks worked",
      "Requirements approved",
      "Requirements",
      "Supervisor rating (1-5)",
      "Final evaluation",
      "Final evaluation out of",
      "Concerns",
      "Summary",
    ],
    rows: students.map((row) => {
      const p = row.performance;
      return [
        row.student_id,
        row.name,
        row.block || "",
        p.status,
        row.verified_hours,
        row.required_hours,
        row.projected_finish || "",
        blank(p.attendance.rate),
        p.attendance.scheduled_days,
        p.late_time_ins,
        p.logs_rejected,
        p.logs_corrected,
        p.tasks.assigned,
        p.tasks.on_time,
        p.tasks.late,
        blank(p.tasks.average_rating),
        p.weekly_reports.submitted,
        p.weekly_reports.weeks_worked,
        p.requirements.approved,
        p.requirements.required,
        blank(p.supervisor_rating),
        blank(p.final_evaluation?.average),
        blank(p.final_evaluation?.scale),
        p.concerns,
        p.summary,
      ];
    }),
  };
}

/** A page-width version for the PDF: the columns that fit, and the sentence. */
export function performancePdfSection(students: PerformanceStudent[]): ReportSection {
  return {
    title: "Student performance",
    head: ["Student", "Block", "Status", "Hours", "Attendance", "Tasks late", "Summary"],
    rows: students.map((row) => [
      row.name,
      row.block || "",
      row.performance.status,
      `${row.verified_hours} of ${row.required_hours}`,
      row.performance.attendance.rate === null ? "" : `${row.performance.attendance.rate}%`,
      row.performance.tasks.late,
      row.performance.summary,
    ]),
  };
}
