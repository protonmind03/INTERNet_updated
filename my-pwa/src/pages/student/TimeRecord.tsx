import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DtrSheet from "../../components/DtrSheet";
import Icon from "../../components/Icon";
import { ErrorNotice } from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import { useAccount } from "../../lib/session";
import { logDateKey, useAttendance } from "./useAttendance";

/** The student's printable Daily Time Record. */
export default function TimeRecord() {
  const student = useAccount("student");
  const attendance = useAttendance(student?.student_id);
  const [supervisor, setSupervisor] = useState("");

  const studentId = student?.student_id;
  useEffect(() => {
    if (!studentId) return;
    let active = true;
    fetch(`${API_URL}/api/company/${encodeURIComponent(studentId)}`, withStudentAuth())
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.company?.supervisor) setSupervisor(String(data.company.supervisor));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [studentId]);

  return (
    <StudentLayout
      title="Time record"
      subtitle="Your attendance for one month, ready to print and have signed."
      actions={
        <Link
          to="/daily-log"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 print:hidden"
        >
          <Icon name="chevron-right" size={15} className="rotate-180" />
          Back to attendance
        </Link>
      }
    >
      {attendance.error && (
        <div className="mb-4">
          <ErrorNotice message={attendance.error} onRetry={() => void attendance.reload()} />
        </div>
      )}
      <DtrSheet
        loading={attendance.loading}
        person={{
          name: student?.name || "",
          studentId: student?.student_id || "",
          program: student?.program,
          company: student?.company,
          supervisor,
        }}
        logs={attendance.logs.map((log) => ({ ...log, date: logDateKey(log) }))}
      />
    </StudentLayout>
  );
}
