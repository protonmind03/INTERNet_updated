import { useSearchParams } from "react-router-dom";
import MonthCalendar from "../../components/MonthCalendar";
import type {
  CalendarAbsence,
  CalendarHoliday,
  CalendarShift,
  CalendarTask,
  ShiftPattern,
} from "../../lib/studentCalendar";
import { logDateKey } from "./useAttendance";
import { useTimeIn } from "./timeInContext";

/**
 * The student's own month. The calendar itself is shared with the
 * supervisor's intern page (components/MonthCalendar.tsx); this gives it
 * the logs the layout already holds, kept for offline use. Iteration 21: a
 * notification about a log opens it as ?log=<id>, and its day's sheet opens
 * by itself; the sheet no longer sends the trainee to Attendance.
 */
export default function ScheduleMonth(props: {
  shifts: CalendarShift[];
  /** How the schedule repeats (Iteration 11). */
  pattern?: ShiftPattern | null;
  holidays: CalendarHoliday[];
  absences: CalendarAbsence[];
  tasks: CalendarTask[];
  termStart: string | null;
}) {
  const { attendance } = useTimeIn();
  const [params] = useSearchParams();
  const asked = params.get("log");
  const log = asked ? attendance.logs.find((entry) => String(entry.id) === asked) : undefined;
  return <MonthCalendar {...props} logs={attendance.logs} pictureRole="student" openDate={log ? logDateKey(log) : null} />;
}
