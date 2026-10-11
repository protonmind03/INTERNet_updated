/** The Resolution Center's tabs, and the address of each. */
export type ResolutionTab = "concerns" | "evaluations";

export const RESOLUTION_PATH = "/student/resolution";

export const RESOLUTION_TABS: readonly { value: ResolutionTab; label: string }[] = [
  { value: "concerns", label: "Concerns" },
  { value: "evaluations", label: "Evaluations" },
];

export const resolutionPath = (tab: ResolutionTab) => `${RESOLUTION_PATH}?tab=${tab}`;
