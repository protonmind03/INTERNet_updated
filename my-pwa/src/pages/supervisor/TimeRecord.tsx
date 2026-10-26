import { Link, useSearchParams } from "react-router-dom";
import DtrSheet from "../../components/DtrSheet";
import Icon from "../../components/Icon";
import { Avatar, Card, EmptyState, ErrorNotice } from "../../components/ui";
import { formatHours } from "../../lib/format";
import { formatPhDay, phToday } from "../../lib/phTime";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { useAccount } from "../../lib/session";
import { toast } from "../../lib/toast";
import { changeDtrCertification, useDtrCertifications } from "../../lib/useDtrCertifications";
import { useHolidays } from "../../lib/useHolidays";
import { useSupervisorWork } from "./useSupervisorWork";
import { sameId } from "../../lib/ids";

/** An intern's printable Daily Time Record, for the supervisor to sign. */
export default function SupervisorTimeRecord() {
  const supervisor = useAccount("supervisor");
  const work = useSupervisorWork(supervisor?.supervisor_id, ["interns", "attendance", "absences"]);
  const holidays = useHolidays("supervisor");
  const [params, setParams] = useSearchParams();
  const studentId = params.get("student") || "";
  const intern = work.interns.find((item) => sameId(item.student_id, studentId));
  const dtr = useDtrCertifications("supervisor", intern?.student_id);
  const month = phToday().slice(0, 7);

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
            viewer="supervisor"
            key={intern.student_id}
            loading={work.loading}
            person={{
              name: intern.name,
              studentId: intern.student_id,
              program: intern.program,
              company: intern.company,
              supervisor: supervisor?.name,
            }}
            logs={work.attendance.filter((entry) => sameId(entry.student_id, intern.student_id))}
            absences={work.absences.filter((entry) => sameId(entry.student_id, intern.student_id))}
            holidays={holidays}
            certifications={dtr.certifications}
            onCertify={async (month) => {
              toast.success(
                await changeDtrCertification({ certify: { student_id: intern.student_id, month } })
              );
              await dtr.reload();
            }}
            onWithdraw={async (id) => {
              toast.success(await changeDtrCertification({ withdraw: id }));
              await dtr.reload();
            }}
          />
        ) : (
          !work.loading &&
          (work.interns.length === 0 ? (
            <Card>
              <EmptyState icon="clock" title="No interns yet" description="Time records are for the interns assigned to you." />
            </Card>
          ) : (
            // Who to open: each intern's month so far (sv10-26), in place of an empty box.
            <section aria-labelledby="dtr-pick-title" className="print:hidden">
              <h2 id="dtr-pick-title" className="mb-3 text-[15px] font-bold text-slate-900">
                {formatPhDay(`${month}-01`, { month: "long", year: "numeric" })} so far
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {work.interns.map((item, index) => {
                  const logs = work.attendance.filter((entry) => sameId(entry.student_id, item.student_id) && String(entry.date).startsWith(month));
                  const verified = logs.filter((entry) => entry.status === "Verified").reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
                  const pending = logs.filter((entry) => entry.status === "Pending").length;
                  return (
                    <li key={item.student_id} className="intern-card" style={{ ["--i" as string]: index }}>
                      <button
                        type="button"
                        onClick={() => setParams({ student: item.student_id })}
                        className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-inset ring-(--role-hairline) transition-all hover:-translate-y-0.5 hover:shadow-raised"
                      >
                        <Avatar name={item.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-bold text-slate-900">{item.name}</span>
                          <span className="block text-[13px] text-slate-600">
                            {formatHours(verified)} verified · {logs.length} {logs.length === 1 ? "day" : "days"}
                            {pending > 0 && <span className="font-semibold text-amber-800"> · {pending} to verify</span>}
                          </span>
                        </span>
                        <Icon name="printer" size={18} className="text-psu-700" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </SupervisorLayout>
  );
}
