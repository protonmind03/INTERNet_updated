/* Phase 2.6: the semesters a term and a program's OJT can be in (migration 090). */

export const SEMESTERS = ["first", "second", "midyear"] as const;
export type Semester = (typeof SEMESTERS)[number];

export const SEMESTER_WORDS: Record<Semester, string> = { first: "first semester", second: "second semester", midyear: "midyear" };

export const isSemester = (value: unknown): value is Semester => SEMESTERS.includes(value as Semester);
