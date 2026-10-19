import type { IconName } from "../../components/Icon";
import type { TimeInValue } from "./timeInContext";
import type { DayStage } from "./useAttendance";

/**
 * The four steps of a day as every screen names them (Iteration 20). The
 * printed record keeps its own columns: AM In, AM Out, PM In, PM Out.
 */
export const STEP_NAMES = {
  timeIn: "Time in",
  lunch: "Lunch break",
  endBreak: "End break",
  timeOut: "Time out",
} as const;

/** The one thing a student does next today, as a button shows it. */
export type NextStep = {
  /** Short, for the button's face. */
  label: string;
  /** In full, for a screen reader. */
  name: string;
  icon: IconName;
  run: (actions: Pick<TimeInValue, "openTimeIn" | "openStep">) => void;
};

/**
 * What comes next at each point in the day; nothing once the student has
 * timed out. Skipping lunch and timing out straight away is done from the
 * Attendance page, where both choices are offered.
 */
export function nextStep(stage: DayStage): NextStep | null {
  if (stage === "not-started") {
    return { label: STEP_NAMES.timeIn, name: STEP_NAMES.timeIn, icon: "camera", run: (actions) => actions.openTimeIn() };
  }
  if (stage === "working") {
    return { label: STEP_NAMES.lunch, name: STEP_NAMES.lunch, icon: "coffee", run: (actions) => actions.openStep("break") };
  }
  if (stage === "on-break") {
    return { label: STEP_NAMES.endBreak, name: STEP_NAMES.endBreak, icon: "arrow-right", run: (actions) => actions.openStep("back") };
  }
  if (stage === "back") {
    return { label: STEP_NAMES.timeOut, name: STEP_NAMES.timeOut, icon: "stop", run: (actions) => actions.openStep("out") };
  }
  return null;
}

