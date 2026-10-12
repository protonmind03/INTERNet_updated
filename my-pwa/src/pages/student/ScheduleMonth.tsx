import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import MonthCalendar from "../../components/MonthCalendar";
import type {
  CalendarAbsence,
  CalendarHoliday,
  CalendarShift,
  CalendarTask,
} from "../../lib/studentCalendar";
import { useTimeIn } from "./timeInContext";

/**
 * The student's own month. The calendar itself is shared with the
 * supervisor's intern page (components/MonthCalendar.tsx); this gives it
 * the logs the layout already holds, kept for offline use, and the way on
 * from a day's details.
 */
export default function ScheduleMonth(props: {
  shifts: CalendarShift[];
  holidays: CalendarHoliday[];
  absences: CalendarAbsence[];
  tasks: CalendarTask[];
  termStart: string | null;
}) {
  const { attendance } = useTimeIn();
  return (
    <MonthCalendar
      {...props}
      logs={attendance.logs}
      dayFooter={(facts) => {
        const toTasks = facts.due.length > 0 && !facts.log;
        return (
          <Link
            to={toTasks ? "/task" : "/daily-log"}
            className="inline-flex items-center gap-1 text-sm font-semibold text-psu-700 hover:underline"
          >
            {toTasks ? "Go to tasks" : "Go to attendance"}
            <Icon name="chevron-right" size={14} />
          </Link>
        );
      }}
    />
  );
}
