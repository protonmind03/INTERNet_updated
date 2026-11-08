import { API_URL, withRoleAuth } from "./api";
import type { OfflineRole } from "./offlineStore";

/*
|--------------------------------------------------------------------------
| THE TRAINEE'S OJT RECORD: THE APP'S SIDE (revisions, November 2026)
|--------------------------------------------------------------------------
|
| Calls to backend/src/routes/traineeRecord.ts and the shapes they answer
| with: the Student-Intern's Feedback Form (PSU FM-AA-INT-20), the daily
| and monthly progress reports, and the narrative report's written parts.
|
*/

/** The form's seven statements, as the server lists them (services/traineeRecord.ts). */
export const FEEDBACK_CRITERIA = [
  { key: "aligned", text: "My training is aligned with my field of specialization." },
  { key: "challenging", text: "My training is challenging." },
  { key: "learning", text: "I have opportunities for learning." },
  { key: "policies", text: "I am aware of the policies of the company." },
  { key: "relationship", text: "I have a positive working relationship with my supervisor and other employees of the company." },
  { key: "hazards", text: "I am aware of the risks and hazards of my working environment." },
  { key: "safety", text: "My department is committed to ensuring the health and safety of its student-interns." },
] as const;

/** Left to right as on the paper form: 5 down to 1. */
export const FEEDBACK_CHOICES = [
  { value: 5, label: "Strongly Agree", short: "Strongly agree" },
  { value: 4, label: "Agree", short: "Agree" },
  { value: 3, label: "Neither Agree nor Disagree", short: "Neither" },
  { value: 2, label: "Disagree", short: "Disagree" },
  { value: 1, label: "Strongly Disagree", short: "Strongly disagree" },
] as const;

export type FeedbackForm = {
  ratings: Record<string, number>;
  problems_met: string | null;
  other_concerns: string | null;
  submitted_at: string | null;
  updated_at: string;
};

export type ReportEntry = {
  id: number;
  report_id: number;
  happened_at: string | null;
  title: string;
  details: string;
  pictures: number;
  created_at: string;
  updated_at: string;
};

export type DailyReport = {
  id: number;
  report_date: string;
  summary: string | null;
  entries: ReportEntry[];
  updated_at: string;
};

export type MonthlyReport = { id: number; month: string; summary: string | null; highlights: string | null; updated_at: string };

/** A part: its text, and the guided form's fields for the parts built with one (change1108). */
export type NarrativePart = { text: string; data?: Record<string, unknown>; updated_at: string };
export type NarrativeParts = Record<string, NarrativePart | undefined>;

async function call<T>(role: OfflineRole, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, withRoleAuth(role, init));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { message?: string }).message || "That could not be done.");
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const sid = (studentId: string) => encodeURIComponent(studentId);

export const traineeRecord = {
  feedbackForm: (role: OfflineRole, studentId: string) =>
    call<{ form: FeedbackForm | null }>(role, `/api/students/${sid(studentId)}/feedback-form`),
  saveFeedbackForm: (studentId: string, body: { ratings: Record<string, number>; problems_met: string; other_concerns: string; submit?: boolean }) =>
    call<{ message: string; form: FeedbackForm }>("student", `/api/students/${sid(studentId)}/feedback-form`, json("PUT", body)),

  dailyReports: (role: OfflineRole, studentId: string, from?: string, to?: string) => {
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const suffix = query.toString() ? `?${query}` : "";
    return call<{ from: string; to: string; today: string; reports: DailyReport[]; closed_weeks: string[] }>(
      role,
      `/api/students/${sid(studentId)}/daily-reports${suffix}`
    );
  },
  saveDay: (studentId: string, day: string, summary: string) =>
    call<{ report: Omit<DailyReport, "entries"> }>("student", `/api/students/${sid(studentId)}/daily-reports/${day}`, json("PUT", { summary })),
  addEntry: (studentId: string, day: string, body: { title: string; details: string; happened_at?: string | null }) =>
    call<{ entry: ReportEntry }>("student", `/api/students/${sid(studentId)}/daily-reports/${day}/entries`, json("POST", body)),
  saveEntry: (studentId: string, entryId: number, body: { title: string; details: string; happened_at?: string | null }) =>
    call<{ entry: ReportEntry }>("student", `/api/students/${sid(studentId)}/report-entries/${entryId}`, json("PUT", body)),
  removeEntry: (studentId: string, entryId: number) =>
    call<{ message: string }>("student", `/api/students/${sid(studentId)}/report-entries/${entryId}`, { method: "DELETE" }),

  monthlyReports: (role: OfflineRole, studentId: string) => call<{ months: MonthlyReport[] }>(role, `/api/students/${sid(studentId)}/monthly-reports`),
  saveMonth: (studentId: string, month: string, body: { summary: string; highlights: string }) =>
    call<{ month: MonthlyReport }>("student", `/api/students/${sid(studentId)}/monthly-reports/${month}`, json("PUT", body)),

  narrative: (role: OfflineRole, studentId: string) =>
    call<{ parts: NarrativeParts; updated_at: string | null }>(role, `/api/students/${sid(studentId)}/narrative`),
  saveNarrativePart: (studentId: string, part: string, text: string, data?: Record<string, unknown>) =>
    call<{ part: NarrativePart }>("student", `/api/students/${sid(studentId)}/narrative/${part}`, json("PUT", data ? { text, data } : { text })),
};
