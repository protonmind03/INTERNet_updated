/*
| The university's internship forms, as their codes, revisions and dates
| appear at the top right of each (read from the photos of the real forms,
| November 2026). components/PsuFormSheet.tsx prints them.
*/

export type FormCode = { code: string; rev: string; date: string };

/** The codes as they appear on the university's forms. */
export const PSU_FORMS = {
  application: { code: "FM-AA-INT-01", rev: "Rev. 0", date: "03-Oct-2017" },
  unitsEarned: { code: "FM-AA-INT-02", rev: "Rev. 0", date: "03-Oct-2017" },
  consent: { code: "FM-AA-INT-03", rev: "Rev. 02", date: "14-Oct-2024" },
  endorsement: { code: "FM-AA-INT-06", rev: "Rev. 02", date: "03-Oct-2024" },
  evaluation: { code: "FM-AA-INT-13", rev: "Rev. 0", date: "01-Feb-2017" },
  timeframe: { code: "FM-AA-INT-17", rev: "Rev. 0", date: "01-Feb-2017" },
  waiver: { code: "FM-AA-INT-18", rev: "Rev. 0", date: "01-Feb-2017" },
  weeklyReport: { code: "FM-AA-INT-19", rev: "Rev. 1", date: "14-Oct-2024" },
  feedback: { code: "FM-AA-INT-20", rev: "Rev. 0", date: "01-Feb-2017" },
} satisfies Record<string, FormCode>;
