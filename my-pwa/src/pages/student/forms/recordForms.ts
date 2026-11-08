import { formatPhDay, phDateKey } from "../../../lib/phTime";
import { PSU_FORMS } from "../../../lib/psuForms";
import { TERMINATION_REASONS, isWeighted, letterOf, ojtGrade } from "../../../lib/ojtGrade";
import { FEEDBACK_CHOICES, FEEDBACK_CRITERIA } from "../../../lib/traineeRecord";
import type { FinalEvaluation } from "../../../lib/useFinalEvaluation";
import type { Block, Cell, DocMeta, Line } from "./formModel";

/*
|--------------------------------------------------------------------------
| THE FORMS INTERNET FILLS IN FROM THE RECORD (November 2026)
|--------------------------------------------------------------------------
|
| The university's forms whose content the record already holds, written
| as blocks for the same engine as the pre-OJT forms (FormSheet.tsx on the
| page, formPdf.ts for the PDF, formOutput.ts for print and Word), read
| from the photos of the real forms:
|
|   Internship Time Frame                   FM-AA-INT-17   every day worked
|   Internship/Practicum Weekly Report      FM-AA-INT-19   every weekly report
|   Student-Intern's Feedback Form          FM-AA-INT-20   the trainee's ratings
|   Internship Evaluation Form              FM-AA-INT-13   the supervisor's ratings
|
| Lines the app does not keep (the instructor, the job description, the
| signatures) are left to write on.
|
*/

export const TIMEFRAME: DocMeta = { key: "timeframe", title: "Internship Time Frame", code: PSU_FORMS.timeframe, compact: true };
export const WEEKLY: DocMeta = { key: "weekly", title: "Internship/Practicum Weekly Report", code: PSU_FORMS.weeklyReport };
export const FEEDBACK: DocMeta = { key: "feedback", title: "Student-Intern's Feedback Form", code: PSU_FORMS.feedback };
export const EVALUATION: DocMeta = { key: "evaluation", title: "Internship Evaluation Form", code: PSU_FORMS.evaluation, compact: true };

const line = (v: string, w: Line["w"] = "m"): Line => ({ v, w });
const label = (text: string, extra: Partial<Cell> = {}): Cell => ({ text, label: true, ...extra });
const head = (text: string): Cell => ({ text, label: true, head: true });
const dateLine = (value = ""): Line[] => [line(value, "m")];

/** "February 10, 2026" from "2026-02-10". */
export const longDay = (day: string | undefined | null) => (day ? formatPhDay(day, { month: "long", day: "2-digit", year: "numeric" }) : "");
const round = (value: number) => Math.round(value * 100) / 100;

/* ---------- FM-AA-INT-17 ---------- */

export type TimeframeData = {
  name: string;
  yearCourse: string;
  company: string;
  companyAddress: string;
  hours: string;
  /** Each day worked, oldest first. */
  days: { day: string; hours: number }[];
  representative?: string;
};

export function timeframeBlocks(data: TimeframeData): Block[] {
  const total = data.days.reduce((sum, item) => sum + item.hours, 0);
  return [
    {
      kind: "table",
      cols: [26, 74],
      rows: [
        [label("Name of student-intern"), { v: data.name }],
        [label("Year and course"), { v: data.yearCourse }],
        [label("Company name"), { v: data.company }],
        [label("Company address"), { v: data.companyAddress }],
        [label("Number of hours"), { v: data.hours }],
      ],
    },
    {
      kind: "table",
      cols: [40, 34, 26],
      head: 1,
      rows: [
        [head("Date"), head("Day"), head("Number of hours")],
        ...data.days.map((item): Cell[] => [
          { v: longDay(item.day), align: "center", bold: true },
          { v: formatPhDay(item.day, { weekday: "long" }), align: "center", bold: true },
          { v: String(round(item.hours)), align: "center", bold: true },
        ]),
        // Before the first verified day: lines to write on, above the total.
        ...(data.days.length ? [] : Array.from({ length: 5 }, (): Cell[] => [{ v: "" }, { v: "" }, { v: "" }])),
        [label("Total number of hours", { span: 2, align: "center", bold: true }), { v: `${round(total)} hours`, align: "center", bold: true }],
      ],
    },
    { kind: "signatures", columns: 1, align: "left", items: [{ lead: "PREPARED BY:", leadBold: true, name: data.name, title: "Student-Intern", after: [["Date: ", ...dateLine()]] }] },
    {
      kind: "signatures",
      items: [
        { lead: "NOTED BY:", leadBold: true, title: "Internship / Practicum Subject Instructor", after: [["Date: ", ...dateLine()]] },
        { lead: "APPROVED BY:", leadBold: true, name: data.representative, title: "Company's Authorized Representative", after: [["Date: ", ...dateLine()]] },
      ],
    },
  ];
}

/* ---------- FM-AA-INT-19 ---------- */

export type WeeklyData = {
  name: string;
  instructor: string;
  company: string;
  jobDescription: string;
  start?: string;
  end?: string;
  hours: string;
  weeks: { label: string; tasks: string; learned: string }[];
  supervisor?: string;
};

export function weeklyBlocks(data: WeeklyData): Block[] {
  return [
    {
      kind: "table",
      cols: [26, 74],
      rows: [
        [label("Name of student-intern"), { v: data.name }],
        [label("Internship instructor"), { v: data.instructor }],
        [label("Name of company"), { v: data.company }],
        [label("Job description"), { v: data.jobDescription }],
        [label("Start date"), { v: longDay(data.start) }],
        [label("End date"), { v: longDay(data.end) }],
        [label("Number of hours"), { v: data.hours ? `${data.hours} hours` : "" }],
      ],
    },
    {
      kind: "table",
      cols: [18, 47, 35],
      head: 1,
      rowMm: 14,
      rows: [
        [head("Date"), head("Tasks accomplished"), head("Knowledge, skills, values learned")],
        ...data.weeks.map((week): Cell[] => [
          { v: week.label, plain: true, top: true },
          { v: week.tasks, plain: true, top: true, size: 9.5 },
          { v: week.learned, plain: true, top: true, size: 9.5, bold: true },
        ]),
      ],
      empty: data.weeks.length ? 0 : 3,
    },
    {
      kind: "signatures",
      items: [
        { lead: "PREPARED BY:", leadBold: true, name: data.name, title: "Signature of Student-Intern", after: [["Date: ", ...dateLine()]] },
        { lead: "NOTED BY:", leadBold: true, name: data.supervisor, title: "Signature over printed name of On-Site Supervisor", after: [["Date: ", ...dateLine()]] },
      ],
    },
  ];
}

/** "February 10-13, 2026" for the days worked in the week from `start`. */
export function weekRange(start: string, worked: string[]): string {
  const shift = (day: string, days: number) => {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const days = worked.filter((day) => day >= start && day <= shift(start, 6)).sort();
  const first = days[0] ?? start;
  const last = days[days.length - 1] ?? shift(start, 4);
  const month = formatPhDay(first, { month: "long" });
  const year = formatPhDay(last, { year: "numeric" });
  return formatPhDay(last, { month: "long" }) === month
    ? `${month} ${formatPhDay(first, { day: "numeric" })}-${formatPhDay(last, { day: "numeric" })}, ${year}`
    : `${month} ${formatPhDay(first, { day: "numeric" })} - ${formatPhDay(last, { month: "long", day: "numeric" })}, ${year}`;
}

/* ---------- FM-AA-INT-20 ---------- */

export type FeedbackData = {
  name: string;
  course: string;
  department: string;
  company: string;
  ratings: Record<string, number>;
  problems: string;
  concerns: string;
  date?: string;
};

export function feedbackBlocks(data: FeedbackData): Block[] {
  return [
    {
      kind: "table",
      cols: [26, 74],
      rows: [
        [label("Name of student-intern"), { v: data.name }],
        [label("Course"), { v: data.course }],
        [label("Department"), { v: data.department }],
        [label("Company name"), { v: data.company }],
      ],
    },
    {
      kind: "table",
      cols: [45, 11, 11, 11, 11, 11],
      head: 1,
      rowMm: 7,
      rows: [
        [head("Criteria"), ...FEEDBACK_CHOICES.map((choice) => head(choice.label))],
        ...FEEDBACK_CRITERIA.map((criterion): Cell[] => [
          { v: criterion.text, plain: true },
          ...FEEDBACK_CHOICES.map((choice): Cell => (data.ratings[criterion.key] === choice.value ? { v: "", mark: "check" } : { v: "" })),
        ]),
      ],
    },
    { kind: "box", title: "Problems met:", text: data.problems, mm: 48 },
    { kind: "box", title: "Other concerns:", text: data.concerns, mm: 48 },
    { kind: "signatures", columns: 1, items: [{ name: data.name, title: "Signature of Student-Intern", after: [["Date: ", line(longDay(data.date), "l")]] }] },
  ];
}

/* ---------- FM-AA-INT-13 ---------- */

export type EvaluationData = {
  name: string;
  company: string;
  companyAddress: string;
  started?: string;
  ended?: string;
  hours?: string;
  evaluation: FinalEvaluation;
};

export function evaluationBlocks(data: EvaluationData): Block[] {
  const { evaluation } = data;
  const { criteria, scale_max: scale } = evaluation.form_snapshot;
  const weighted = isWeighted(criteria);
  const graded = evaluation.grade ?? ojtGrade(criteria, evaluation.ratings, scale)?.grade ?? null;
  const outcome = evaluation.outcome ?? {};
  const terminated = outcome.terminated ?? [];

  const rows: Cell[][] = [[head("Competency"), head("Criteria"), head("Rating"), head("Remarks")]];
  criteria.forEach((criterion, index) => {
    const rating = evaluation.ratings[criterion.key];
    const points = rating && criterion.weight !== undefined ? round((rating * criterion.weight) / 100).toFixed(1) : "";
    for (let step = 0; step < scale; step += 1) {
      const value = scale - step;
      const cells: Cell[] = [];
      if (step === 0)
        // "Motivation/ Initiative": a long name may wrap at its slash, never inside a word.
        cells.push({ text: `${letterOf(index)}. ${criterion.label.replace(/\/(?=\S)/g, "/ ")}${criterion.weight !== undefined ? ` (${criterion.weight}%)` : ""}`, label: true, bold: true, align: "center", rows: scale, size: 8.6 });
      cells.push({ v: criterion.levels?.[value - 1] ?? "", plain: true, size: 8 });
      cells.push({ v: String(value), align: "center", mark: rating === value ? "circle" : undefined });
      if (step === 0) cells.push({ v: points || (rating && !weighted ? `${rating} of ${scale}` : ""), align: "center", rows: scale, plain: true });
      rows.push(cells);
    }
  });
  rows.push([
    { text: "OJT GRADE\n= Total Points (A + B + C + D + E + F + G + H x 10) / 50 x 50 + 50", label: true, bold: true, span: 3, align: "center", plain: true },
    { v: graded !== null ? Number(graded).toFixed(2) : "", align: "center", bold: true, size: 14 },
  ]);

  return [
    {
      kind: "para",
      align: "center",
      size: 9,
      runs: [
        "This form is to be completed by the host company or a designated supervisor. This form shall be completed and submitted to the office of Campus Internship Coordinator and Internship / Practicum Subject Instructor upon completion of ",
        { b: data.hours || "the required" },
        " training hours.",
      ],
    },
    {
      kind: "table",
      cols: [26, 34, 17, 23],
      rows: [
        [label("Name of student-intern"), { v: data.name, span: 3, bold: true }],
        [label("Name of company / firm / agency"), { v: data.company, span: 3, bold: true }],
        [label("Company address"), { v: data.companyAddress, span: 3, bold: true }],
        [label("Date started"), { v: longDay(data.started), bold: true }, label("Date ended", { bold: true }), { v: longDay(data.ended), bold: true }],
      ],
    },
    {
      kind: "para",
      size: 9,
      runs: [
        `INSTRUCTIONS: Evaluate Student-Intern fairly and honestly based on his/her performance considering their time in the trade. Rate all ${criteria.length} competencies below. There are criteria under each competency. Please rate by encircling the appropriate number that best describes the extent of the performance of the Student-Intern.`,
      ],
    },
    { kind: "table", cols: [21, 56, 9, 14], head: 1, rows },
    { kind: "para", align: "center", size: 9, runs: ["Please discuss strengths & weaknesses with the student trainee to encourage and motivate improve performance.\n", { b: "NOTE:" }, " When you terminate a student-trainee for any reason, please check the items below."] },
    { kind: "para", align: "left", italic: true, runs: [{ b: "The Internship Practicum was terminated:" }] },
    {
      kind: "checks",
      columns: 2,
      items: [
        ...TERMINATION_REASONS.map((reason) => ({ text: reason, on: terminated.includes(reason) })),
        { text: `Other(s), please specify${outcome.other ? `: ${outcome.other}` : ""}`, on: Boolean(outcome.other) },
      ],
    },
    {
      kind: "checks",
      italic: true,
      items: [
        { text: "We would be pleased to employ this Student-Trainee in the future", on: Boolean(outcome.employ) },
        { text: "He/She needs to improve his/her performance.", on: Boolean(outcome.improve) },
      ],
    },
    ...(evaluation.remarks?.trim() ? ([{ kind: "box", title: "Remarks:", text: evaluation.remarks, mm: 14 }] as Block[]) : []),
    {
      kind: "signatures",
      items: [
        { name: evaluation.supervisor_name, title: "Printed Name and Signature of Person Completing", after: [["Date: ", line(longDay(phDateKey(evaluation.submitted_at)), "l")]] },
        { name: data.name, title: "Signature of Student-Intern", after: [["Date: ", line("", "l")]] },
      ],
    },
    { kind: "gap", mm: 2 },
    { kind: "signatures", columns: 1, items: [{ lead: "APPROVED:", leadBold: true, title: "Training Supervisor" }] },
  ];
}
