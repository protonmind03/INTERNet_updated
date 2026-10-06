import { Link, useSearchParams } from "react-router-dom";
import DtrSheet from "../../components/DtrSheet";
import Icon from "../../components/Icon";
import { Card, EmptyState, ErrorNotice } from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { useAccount } from "../../lib/session";
import { useSupervisorWork } from "./useSupervisorWork";

/** An intern's printable Daily Time Record, for the supervisor to sign. */
export default function SupervisorTimeRecord() {
  const supervisor = useAccount("supervisor");
  const work = useSupervisorWork(supervisor?.supervisor_id, ["interns", "attendance", "absences"]);
  const [params, setParams] = useSearchParams();
  const studentId = params.get("student") || "";
  const intern = work.interns.find((item) => item.student_id === studentId);

  return (
    <SupervisorLayout
      title="Time record"
      subtitle="An intern's attendance for one month, ready to print and sign."
      actions={
        <Link
          to="/supervisor/interns"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 print:hidden"
        >
          <Icon name="chevron-right" size={15} className="rotate-180" />
          Back to interns
        </Link>
      }
    >
      <div className="space-y-4">
        {work.error && <ErrorNotice message={work.error} onRetry={() => void work.reload()} />}

        <label className="flex max-w-sm flex-col gap-1.5 text-sm font-medium text-slate-700 print:hidden">
          Intern
          <select
            value={studentId}
            onChange={(event) =>
              setParams(event.target.value ? { student: event.target.value } : {})
            }
            className="field"
          >
            <option value="">Choose an intern</option>
            {work.interns.map((item) => (
              <option key={item.student_id} value={item.student_id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        {intern ? (
          <DtrSheet
            key={intern.student_id}
            loading={work.loading}
            person={{
              name: intern.name,
              studentId: intern.student_id,
              program: intern.program,
              company: intern.company,
              supervisor: supervisor?.name,
            }}
            logs={work.attendance.filter((entry) => entry.student_id === intern.student_id)}
            absences={work.absences.filter((entry) => entry.student_id === intern.student_id)}
          />
        ) : (
          !work.loading && (
            <Card>
              <EmptyState
                icon="clock"
                title="Choose an intern"
                description="Their time record for the month will appear here."
              />
            </Card>
          )
        )}
      </div>
    </SupervisorLayout>
  );
}
