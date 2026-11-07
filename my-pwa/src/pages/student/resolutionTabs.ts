/*
| Where a trainee takes things up: the Resolution Center, in the Support
| folder. Since November 2026 it holds three sections, named in the address
| (?tab=): Concerns (none), Feedback (the evaluations about them and their
| rating of the company; it was its own page at /student/feedback, which
| now opens this section) and Internship evaluation (their FM-AA-INT-20
| feedback form and the supervisor's FM-AA-INT-13).
*/
export type ResolutionTab = "concerns" | "feedback" | "evaluation";

export const RESOLUTION_PATH = "/student/resolution";
/** The old Feedback page's address; it opens the Feedback section. */
export const FEEDBACK_PATH = "/student/feedback";

/** Older names of the sections still met in links and notifications. */
const ALIASES: Record<string, ResolutionTab> = { evaluations: "feedback", feedback: "feedback", evaluation: "evaluation", "internship-evaluation": "evaluation" };

export function resolutionTabOf(value: string | null): ResolutionTab {
  return (value && ALIASES[value]) || "concerns";
}

/** Where a section opens. "evaluations" (the old name of Feedback) is still accepted. */
export const resolutionPath = (tab: ResolutionTab | "evaluations") => {
  const section = tab === "evaluations" ? "feedback" : tab;
  return section === "concerns" ? RESOLUTION_PATH : `${RESOLUTION_PATH}?tab=${section}`;
};
