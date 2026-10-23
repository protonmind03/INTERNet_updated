/*
| Where a trainee takes things up: concerns in the Resolution Center, and
| evaluations (those about them, and their rating of the company) under
| Feedback. They were two tabs of one page; since the PSU redesign's menu
| review each is its own page, as More lists them.
*/
export type ResolutionTab = "concerns" | "evaluations";

export const RESOLUTION_PATH = "/student/resolution";
export const FEEDBACK_PATH = "/student/feedback";

export const resolutionPath = (tab: ResolutionTab) => (tab === "concerns" ? RESOLUTION_PATH : FEEDBACK_PATH);
