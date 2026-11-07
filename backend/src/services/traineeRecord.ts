/*
|--------------------------------------------------------------------------
| THE TRAINEE'S OJT RECORD: WHAT IS ACCEPTED (revisions, November 2026)
|--------------------------------------------------------------------------
|
| The rules for what a trainee writes towards the PSU "Narrative Report on
| Internship Training" (migration 073). The routes are in
| routes/traineeRecord.ts; these functions only read a request's body and
| say what is wrong with it, so they can be tested without a database.
|
*/

/** The seven statements of the Student-Intern's Feedback Form (PSU FM-AA-INT-20, Rev. 0), in order. */
export const FEEDBACK_CRITERIA = [
  { key: "aligned", text: "My training is aligned with my field of specialization." },
  { key: "challenging", text: "My training is challenging." },
  { key: "learning", text: "I have opportunities for learning." },
  { key: "policies", text: "I am aware of the policies of the company." },
  { key: "relationship", text: "I have a positive working relationship with my supervisor and other employees of the company." },
  { key: "hazards", text: "I am aware of the risks and hazards of my working environment." },
  { key: "safety", text: "My department is committed to ensuring the health and safety of its student-interns." },
] as const;

/** 5 Strongly Agree, 4 Agree, 3 Neither, 2 Disagree, 1 Strongly Disagree. */
export const FEEDBACK_SCALE = ["", "Strongly Disagree", "Disagree", "Neither Agree nor Disagree", "Agree", "Strongly Agree"] as const;

export const FEEDBACK_TEXT_MAX = 3000;
export const REPORT_TEXT_MAX = 5000;
export const ENTRY_TITLE_MAX = 160;
export const NARRATIVE_TEXT_MAX = 20000;

/**
 * The parts of the narrative report the trainee writes, keyed as they are
 * saved. Parts the app fills from the record (the summary of tasks, the
 * pictures, the forms) are not here; a trainee's own note on them is.
 */
export const NARRATIVE_PARTS = [
  "title_page",
  "dedication",
  "acknowledgement",
  "agency_profile",
  "organizational_chart",
  "functions_services",
  "introduction",
  "participation",
  "challenges",
  "accomplishments",
  "input_output",
  "impact",
  "tasks_summary",
  "pictures",
  "conclusions",
] as const;
export type NarrativePart = (typeof NARRATIVE_PARTS)[number];

export const isNarrativePart = (value: unknown): value is NarrativePart =>
  typeof value === "string" && (NARRATIVE_PARTS as readonly string[]).includes(value);

type Problem = { problem: string };

function optionalText(value: unknown, max: number, name: string): string | null | Problem {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return { problem: `${name} must be text.` };
  const trimmed = value.trim();
  if (trimmed.length > max) return { problem: `${name} can be at most ${max} characters.` };
  return trimmed === "" ? null : trimmed;
}

const isProblem = (value: unknown): value is Problem =>
  typeof value === "object" && value !== null && "problem" in value;

/** The feedback form as sent: ratings 1 to 5 for any of the statements, two optional texts, and whether it is being submitted. */
export function readFeedbackForm(body: unknown):
  | { ratings: Record<string, number>; problems_met: string | null; other_concerns: string | null; submit: boolean }
  | Problem {
  const input = (body ?? {}) as Record<string, unknown>;
  const raw = input.ratings ?? {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { problem: "Ratings must be given for each statement." };
  const ratings: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!FEEDBACK_CRITERIA.some((criterion) => criterion.key === key)) return { problem: "One of the ratings is for a statement that is not on the form." };
    if (value === null || value === undefined || value === "") continue;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 5) return { problem: "Each rating is from 1 (Strongly Disagree) to 5 (Strongly Agree)." };
    ratings[key] = n;
  }
  const problems = optionalText(input.problems_met, FEEDBACK_TEXT_MAX, "Problems met");
  if (isProblem(problems)) return problems;
  const concerns = optionalText(input.other_concerns, FEEDBACK_TEXT_MAX, "Other concerns");
  if (isProblem(concerns)) return concerns;
  const submit = input.submit === true;
  if (submit && Object.keys(ratings).length < FEEDBACK_CRITERIA.length) {
    return { problem: "Rate every statement before you submit the form." };
  }
  return { ratings, problems_met: problems, other_concerns: concerns, submit };
}

/** A day's own words: optional, at most REPORT_TEXT_MAX characters. */
export function readDaySummary(body: unknown): { summary: string | null } | Problem {
  const summary = optionalText((body as Record<string, unknown> | null)?.summary, REPORT_TEXT_MAX, "The day's report");
  if (isProblem(summary)) return summary;
  return { summary };
}

/** An event on a day: a title or some details (at least one), and the time it happened if known. */
export function readEntry(body: unknown): { title: string; details: string; happened_at: string | null } | Problem {
  const input = (body ?? {}) as Record<string, unknown>;
  const title = optionalText(input.title, ENTRY_TITLE_MAX, "The event's title");
  if (isProblem(title)) return title;
  const details = optionalText(input.details, REPORT_TEXT_MAX, "What happened");
  if (isProblem(details)) return details;
  let happened: string | null = null;
  if (input.happened_at !== undefined && input.happened_at !== null && input.happened_at !== "") {
    if (typeof input.happened_at !== "string" || !/^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/.test(input.happened_at)) {
      return { problem: "Give the time it happened as HH:MM." };
    }
    happened = input.happened_at.length === 5 ? `${input.happened_at}:00` : input.happened_at;
  }
  return { title: title ?? "", details: details ?? "", happened_at: happened };
}

/** The trainee's words for a month. */
export function readMonth(body: unknown): { summary: string | null; highlights: string | null } | Problem {
  const input = (body ?? {}) as Record<string, unknown>;
  const summary = optionalText(input.summary, REPORT_TEXT_MAX, "The month's summary");
  if (isProblem(summary)) return summary;
  const highlights = optionalText(input.highlights, REPORT_TEXT_MAX, "The highlights");
  if (isProblem(highlights)) return highlights;
  return { summary, highlights };
}

/** One part of the narrative report, as text. */
export function readNarrativeText(body: unknown): { text: string } | Problem {
  const text = (body as Record<string, unknown> | null)?.text;
  if (typeof text !== "string") return { problem: "Send the part's text." };
  if (text.length > NARRATIVE_TEXT_MAX) return { problem: `A part can be at most ${NARRATIVE_TEXT_MAX} characters.` };
  return { text };
}

/** A calendar day as YYYY-MM-DD that really exists, or null. */
export function calendarDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

/** A month as YYYY-MM, as the first day of it (YYYY-MM-01), or null. */
export function monthStart(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return `${value}-01`;
}

/** The Monday of the week a day is in (the weekly report's week). */
export function mondayOfDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const back = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}
