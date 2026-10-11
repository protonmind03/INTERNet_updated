import { createContext, useContext } from "react";
import type { AttendanceController } from "./useAttendance";

/** The steps after time-in, each with its own confirmation. */
export type TimeInStep = "break" | "back" | "out";

export type TimeInValue = {
  /** The student's attendance, loaded once for the page. `attendance.stage` is where today stands. */
  attendance: AttendanceController;
  /** The current time, refreshed every few seconds. */
  now: Date;
  online: boolean;
  /** Opens the privacy notice if it has not been agreed to, then the camera check. */
  openTimeIn: () => void;
  /** Opens the confirmation for starting a break, coming back, or timing out. */
  openStep: (step: TimeInStep) => void;
  /** True while any of those dialogs is open. */
  dialogOpen: boolean;
};

export const TimeInContext = createContext<TimeInValue | null>(null);

/** The shared time-in actions. Only inside a student page. */
export function useTimeIn(): TimeInValue {
  const value = useContext(TimeInContext);
  if (!value) throw new Error("useTimeIn is used outside TimeInProvider.");
  return value;
}

/** The same, or null when there is no provider above. */
export function useOptionalTimeIn(): TimeInValue | null {
  return useContext(TimeInContext);
}
