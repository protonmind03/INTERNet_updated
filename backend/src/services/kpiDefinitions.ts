/*
|--------------------------------------------------------------------------
| THE COORDINATOR'S KEY FIGURES: WHAT EACH ONE MEANS
|--------------------------------------------------------------------------
|
| Six figures answer "is the programme going well?". Each has a name, a
| definition a coordinator can read and a page that lists what it counts.
| They are all here and nowhere else: the server works the figures out from
| these (services/kpis.ts) and sends the name and definition along with each
| value, so the screens never keep a second copy.
|
| PSU redesign (Section 7): plain figures. There are no targets, no
| comparison with an earlier week and no weekly points: a figure is a count
| with one line of context and its definition behind an "i". The table of
| targets (kpi_targets, migration 043) is kept as history and no longer read.
|
*/

export type KpiKey =
  | "on_track"
  | "attendance_rate"
  | "review_time"
  | "requirements_complete"
  | "old_concerns"
  | "agreements_ending";

export type KpiDefinition = {
  key: KpiKey;
  label: string;
  /** What is counted, in a sentence or two, as the "?" on the card shows it. */
  definition: string;
  unit: "percent" | "days" | "count";
  /** The page that lists what the figure counts. */
  link: string;
};

/** Days of attendance and of supervisor decisions a figure looks back over. */
export const KPI_WINDOW_DAYS = 28;
/** A student is expected to have their documents in once past this share of their hours. */
export const REQUIREMENTS_DUE_AT = 0.5;
/** A concern still open after this many days counts against the programme. */
export const CONCERN_OLD_AFTER_DAYS = 7;
/** How far ahead an agreement's end is counted. The same as the alert (insights.ts). */
export const AGREEMENT_WITHIN_DAYS = 30;
export const KPI_DEFINITIONS: readonly KpiDefinition[] = [
  {
    key: "on_track",
    label: "Students on track to finish within the term",
    definition:
      "Of the active students, the share whose remaining hours fit before their term ends at the hours they are scheduled for, holidays left out. A student with hours left and nothing scheduled is not on track. A student with no term has no end date to miss and is counted as on track.",
    unit: "percent",
    link: "/coordinator/monitoring?risk=1",
  },
  {
    key: "attendance_rate",
    label: "Attendance on scheduled days, last 4 weeks",
    definition:
      "Of the days students were scheduled to work in the last 28 days (holidays left out, and nothing before a student's first log or term start), the share on which they timed in. A filed absence is not attendance. Today is not counted, because it is not over.",
    unit: "percent",
    link: "/coordinator/monitoring",
  },
  {
    key: "review_time",
    label: "Median time from time-out to supervisor decision",
    definition:
      "For attendance logs a supervisor verified or rejected in the last 28 days, the middle value of the time between the student's time-out and that decision, in days. Half the logs were decided faster than this and half slower.",
    unit: "days",
    link: "/coordinator/supervisors",
  },
  {
    key: "requirements_complete",
    label: "Requirements complete, among students past 50% of hours",
    definition:
      "Of the active students who have verified at least half of their required hours, the share with every required document approved.",
    unit: "percent",
    link: "/coordinator/documents",
  },
  {
    key: "old_concerns",
    label: "Open concerns older than 7 days",
    definition:
      "Concerns reported more than 7 days ago that are neither resolved nor dismissed.",
    unit: "count",
    link: "/coordinator/complaints",
  },
  {
    key: "agreements_ending",
    label: "Agreements ending within 30 days",
    definition:
      "Active companies whose agreement has ended or ends within 30 days. It counts every company, whichever term is chosen.",
    unit: "count",
    link: "/coordinator/companies",
  },
];
