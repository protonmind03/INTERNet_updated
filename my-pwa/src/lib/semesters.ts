/* Phase 2.6: a term's semester, and the semesters a program's OJT runs in (backend routes/semesters.ts). */

export type Semester = "first" | "second" | "midyear";

export const SEMESTER_LABELS: Record<Semester, string> = {
  first: "First semester",
  second: "Second semester",
  midyear: "Midyear",
};
