import { useAccount } from "../../lib/session";
import { useTimeRecordHeader } from "../../lib/timeRecordHeader";
import FormButtons from "./forms/FormButtons";
import { fileNameFor } from "./forms/formModel";
import { WEEKLY, weeklyBlocks } from "./forms/recordForms";
import { usePrintFields, weeklyFrom, type JournalWeek } from "./forms/useFormData";
import { useTimeIn } from "./timeInContext";

/*
|--------------------------------------------------------------------------
| PRACTICUM WEEKLY REPORT (FM-AA-INT-19, Rev. 1, 14-Oct-2024)
|--------------------------------------------------------------------------
|
| Print and Save for the university's weekly report, on the Weekly reports
| page: one table for the whole internship, a row per week, "Week 1
| (February 10-13, 2026)", with "What I did" as the tasks accomplished and
| "What I learned" as the knowledge, skills and values learned
| (forms/recordForms.ts). The instructor and job description typed in Fill
| and print fill their lines; the same form is there too.
|
*/

export default function PracticumWeeklyReport({ journals }: { journals: JournalWeek[] }) {
  const student = useAccount("student");
  const header = useTimeRecordHeader("student", student?.student_id, null);
  const { attendance } = useTimeIn();
  const { fields } = usePrintFields();
  const data = weeklyFrom(journals, attendance.logs, header, fields);
  return (
    <FormButtons
      size="sm"
      meta={WEEKLY}
      blocks={weeklyBlocks(data)}
      campus={header?.institution.campus_name || undefined}
      fileName={fileNameFor(WEEKLY, data.name)}
      printLabel="Print FM-AA-INT-19"
      disabled={journals.length === 0}
    />
  );
}
