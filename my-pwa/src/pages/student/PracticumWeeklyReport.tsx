import { useMemo } from "react";
import PsuFormSheet, { FormField } from "../../components/PsuFormSheet";
import { formatDate, formatLongDate } from "../../lib/format";
import { formatPhDay } from "../../lib/phTime";
import { PSU_FORMS } from "../../lib/psuForms";
import { useAccount } from "../../lib/session";
import { useTimeRecordHeader } from "../../lib/timeRecordHeader";
import { useTimeIn } from "./timeInContext";
import { logDateKey } from "./useAttendance";

/*
|--------------------------------------------------------------------------
| PRACTICUM WEEKLY REPORT, AS PRINTED (FM-AA-INT-19, Rev. 1, 14-Oct-2024)
|--------------------------------------------------------------------------
|
| Read from the photo of the university's form: one table for the whole
| internship, not a page per week. Its head: name of student-intern,
| internship instructor, name of company, job description, start date, end
| date, number of hours. Then a row per week, "Week 1 (February 10-13,
| 2026)", with the tasks accomplished and the knowledge, skills and values
| learned; at the foot, "Prepared by" (the student-intern, with the date)
| and "Noted by" (the on-site supervisor's signature over printed name).
|
| The weeks are the trainee's weekly reports, oldest first: "What I did"
| fills Tasks accomplished, "What I learned" fills Knowledge, skills,
| values learned. The instructor and the job description are left as
| lines to write on: the app does not keep them.
|
*/

type Journal = { week_start: string; activities: string; learnings: string; status: string };

function weekRange(start: string, worked: string[]): string {
  const days = worked.filter((day) => day >= start && day <= shiftDay(start, 6)).sort();
  const first = days[0] ?? start;
  const last = days[days.length - 1] ?? shiftDay(start, 4);
  const month = formatPhDay(first, { month: "long" });
  const sameMonth = formatPhDay(last, { month: "long" }) === month;
  const year = formatPhDay(last, { year: "numeric" });
  return sameMonth
    ? `${month} ${formatPhDay(first, { day: "numeric" })}-${formatPhDay(last, { day: "numeric" })}, ${year}`
    : `${month} ${formatPhDay(first, { day: "numeric" })} - ${formatPhDay(last, { month: "long", day: "numeric" })}, ${year}`;
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function PracticumWeeklyReport({ journals }: { journals: Journal[] }) {
  const student = useAccount("student");
  const header = useTimeRecordHeader("student", student?.student_id, null);
  const { attendance } = useTimeIn();
  const worked = useMemo(() => attendance.logs.filter((log) => log.time_in).map(logDateKey).sort(), [attendance.logs]);
  const weeks = useMemo(() => [...journals].sort((a, b) => a.week_start.localeCompare(b.week_start)), [journals]);
  const start = worked[0];
  const end = worked[worked.length - 1];

  return (
    <PsuFormSheet title="Internship/Practicum Weekly Report" form={PSU_FORMS.weeklyReport} campus={header?.institution.campus_name}>
      <table>
        <tbody>
          <FormField label="Name of student-intern">{header?.trainee.name ?? student?.name}</FormField>
          <FormField label="Internship instructor">{""}</FormField>
          <FormField label="Name of company">{header?.trainee.company ?? student?.company}</FormField>
          <FormField label="Job description">{""}</FormField>
          <FormField label="Start date">{start ? formatLongDate(start) : ""}</FormField>
          <FormField label="End date">{end ? formatLongDate(end) : ""}</FormField>
          <FormField label="Number of hours">{header?.trainee.required_hours ? `${header.trainee.required_hours} HOURS` : ""}</FormField>
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th style={{ width: "18%", textAlign: "center" }}>DATE</th>
            <th style={{ width: "48%", textAlign: "center" }}>TASKS ACCOMPLISHED</th>
            <th style={{ textAlign: "center" }}>KNOWLEDGE, SKILLS, VALUES LEARNED</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((journal, index) => (
            <tr key={journal.week_start} style={{ breakInside: "avoid" }}>
              <td style={{ verticalAlign: "bottom" }}>
                Week {index + 1}
                <br />({weekRange(journal.week_start, worked)})
              </td>
              <td style={{ whiteSpace: "pre-wrap", fontSize: "9.5pt" }}>{journal.activities}</td>
              <td style={{ whiteSpace: "pre-wrap", fontSize: "9.5pt", fontWeight: 700 }}>{journal.learnings}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table>
        <tbody>
          <tr>
            <td style={{ width: "50%", padding: "10px 12px 14px" }}>
              <b>PREPARED BY:</b>
              <br />
              <br />
              <span className="psu-form-line" style={{ display: "block", textAlign: "center" }}>
                {header?.trainee.name ?? student?.name}
              </span>
              <i style={{ display: "block", textAlign: "center", fontSize: "9pt" }}>Signature of Student-Intern</i>
              <br />
              Date: <span className="psu-form-line">{end ? formatDate(end) : ""}</span>
            </td>
            <td style={{ padding: "10px 12px 14px" }}>
              <b>NOTED BY:</b>
              <br />
              <br />
              <span className="psu-form-line" style={{ display: "block", textAlign: "center" }}>
                {header?.trainee.supervisor ?? ""}
              </span>
              <i style={{ display: "block", textAlign: "center", fontSize: "9pt" }}>Signature over printed name of On-Site Supervisor</i>
              <br />
              Date: <span className="psu-form-line" />
            </td>
          </tr>
        </tbody>
      </table>
    </PsuFormSheet>
  );
}
