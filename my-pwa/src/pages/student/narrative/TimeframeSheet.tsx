import PsuFormSheet, { FormField } from "../../../components/PsuFormSheet";
import { formatPhDay } from "../../../lib/phTime";
import { PSU_FORMS } from "../../../lib/psuForms";
import type { TimeRecordHeaderData } from "../../../lib/timeRecordHeader";
import { logDateKey, type AttendanceLog } from "../useAttendance";

/*
| INTERNSHIP TIME FRAME (FM-AA-INT-17, Rev. 0, 01-Feb-2017), as printed:
| name of student-intern, year and course, company name and address,
| number of hours; then Date | Day | Number of hours for every day worked,
| the total, and "Prepared by" (the student-intern), "Noted by" (the
| internship/practicum subject instructor) and "Approved by" (the company's
| authorized representative), each with a date line. The days are the
| trainee's verified days, from the attendance record.
*/
export default function TimeframeSheet({
  logs,
  header,
  onScreen = false,
}: {
  logs: AttendanceLog[];
  header: TimeRecordHeaderData | null;
  onScreen?: boolean;
}) {
  const days = logs.filter((log) => log.time_in && log.status === "Verified").sort((a, b) => logDateKey(a).localeCompare(logDateKey(b)));
  const total = days.reduce((sum, log) => sum + (Number(log.hours) || 0), 0);
  const round = (value: number) => Math.round(value * 100) / 100;
  return (
    <PsuFormSheet title="Internship Time Frame" form={PSU_FORMS.timeframe} campus={header?.institution.campus_name} onScreen={onScreen}>
      <table>
        <tbody>
          <FormField label="Name of student-intern">{header?.trainee.name}</FormField>
          <FormField label="Year and course">{[header?.trainee.block, header?.trainee.program].filter(Boolean).join(" · ")}</FormField>
          <FormField label="Company name">{header?.trainee.company}</FormField>
          <FormField label="Company address">{""}</FormField>
          <FormField label="Number of hours">{header?.trainee.required_hours ?? ""}</FormField>
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: "center" }}>DATE</th>
            <th style={{ textAlign: "center" }}>DAY</th>
            <th style={{ textAlign: "center", width: "22%" }}>NUMBER OF HOURS</th>
          </tr>
        </thead>
        <tbody>
          {days.map((log) => {
            const day = logDateKey(log);
            return (
              <tr key={log.id}>
                <td style={{ textAlign: "center", textTransform: "uppercase", fontWeight: 700 }}>{formatPhDay(day, { month: "long", day: "2-digit", year: "numeric" })}</td>
                <td style={{ textAlign: "center", textTransform: "uppercase", fontWeight: 700 }}>{formatPhDay(day, { weekday: "long" })}</td>
                <td style={{ textAlign: "center", fontWeight: 700 }}>{round(Number(log.hours) || 0)}</td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={2} style={{ textAlign: "center", fontWeight: 800 }}>
              TOTAL NUMBER OF HOURS
            </td>
            <td style={{ textAlign: "center", fontWeight: 800 }}>{round(total)} HOURS</td>
          </tr>
        </tbody>
      </table>
      <table>
        <tbody>
          <tr>
            <td style={{ width: "50%", padding: "10px 12px 16px" }}>
              <b>PREPARED BY:</b>
              <br />
              <br />
              <span className="psu-form-line" style={{ display: "block", textAlign: "center" }}>
                {header?.trainee.name}
              </span>
              <i style={{ display: "block", textAlign: "center", fontSize: "9pt" }}>Student-Intern</i>
              Date: <span className="psu-form-line" />
            </td>
            <td style={{ padding: "10px 12px 16px" }} />
          </tr>
          <tr>
            <td style={{ padding: "10px 12px 16px" }}>
              <b>NOTED BY:</b>
              <br />
              <br />
              <span className="psu-form-line" style={{ display: "block" }}>&nbsp;</span>
              <i style={{ display: "block", textAlign: "center", fontSize: "9pt" }}>Internship / Practicum Subject Instructor</i>
              Date: <span className="psu-form-line" />
            </td>
            <td style={{ padding: "10px 12px 16px" }}>
              <b>APPROVED BY:</b>
              <br />
              <br />
              <span className="psu-form-line" style={{ display: "block", textAlign: "center" }}>
                {header?.trainee.supervisor ?? ""}
              </span>
              <i style={{ display: "block", textAlign: "center", fontSize: "9pt" }}>Company's Authorized Representative</i>
              Date: <span className="psu-form-line" />
            </td>
          </tr>
        </tbody>
      </table>
    </PsuFormSheet>
  );
}
