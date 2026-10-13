import type { IconName } from "../../components/Icon";
import type { TimeInValue } from "./timeInContext";
import type { DayStage } from "./useAttendance";

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
    return { label: "Time in", name: "Time in", icon: "camera", run: (actions) => actions.openTimeIn() };
  }
  if (stage === "working") {
    return { label: "Out for lunch", name: "Out for lunch", icon: "coffee", run: (actions) => actions.openStep("break") };
  }
  if (stage === "on-break") {
    return { label: "Back from lunch", name: "Back from lunch", icon: "arrow-right", run: (actions) => actions.openStep("back") };
  }
  if (stage === "back") {
    return { label: "Time out", name: "Time out", icon: "stop", run: (actions) => actions.openStep("out") };
  }
  return null;
}

