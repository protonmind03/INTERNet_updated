/** The sections of an intern's page (/supervisor/interns/:studentId?tab=). */
export const INTERN_TABS = [
  "overview",
  "attendance",
  "tasks",
  "documents",
  "reports",
  "evaluate",
  "record",
  "notes",
] as const;

export type InternTab = (typeof INTERN_TABS)[number];

export const INTERN_TAB_LABELS: Record<InternTab, string> = {
  overview: "Overview",
  attendance: "Attendance",
  tasks: "Tasks",
  documents: "Documents",
  reports: "Weekly reports",
  evaluate: "Evaluate",
  record: "Time record",
  notes: "Notes",
};

/** Where one intern's page is, opened on a section when one is named. */
export const internPath = (studentId: string, tab?: InternTab) =>
  `/supervisor/interns/${encodeURIComponent(studentId)}${tab && tab !== "overview" ? `?tab=${tab}` : ""}`;
