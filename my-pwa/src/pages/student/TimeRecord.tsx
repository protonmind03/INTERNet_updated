import { useEffect, useState } from "react";
import DtrSheet, { type DtrAbsence } from "../../components/DtrSheet";
import { ErrorNotice } from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import { useAccount } from "../../lib/session";
import { useDtrCertifications } from "../../lib/useDtrCertifications";
import { useHolidays } from "../../lib/useHolidays";
import TimeInProvider from "./TimeInProvider";
import { useTimeIn } from "./timeInContext";
import { logDateKey } from "./useAttendance";

/** The student's printable Daily Time Record. */
export default function TimeRecord() {
  return (
    <TimeInProvider>
      <TimeRecordPage />
    </TimeInProvider>
  );
}

function TimeRecordPage() {
  const student = useAccount("student");
  const { attendance } = useTimeIn();
  const [supervisor, setSupervisor] = useState("");
  const [absences, setAbsences] = useState<DtrAbsence[]>([]);
  const holidays = useHolidays("student");

  const studentId = student?.student_id;
  const { certifications } = useDtrCertifications("student", studentId);
  useEffect(() => {
    if (!studentId) return;
    let active = true;
    fetch(`${API_URL}/api/company/${encodeURIComponent(studentId)}`, withStudentAuth())
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.company?.supervisor) setSupervisor(String(data.company.supervisor));
      })
      .catch(() => undefined);
    fetch(`${API_URL}/api/absences/student/${encodeURIComponent(studentId)}`, withStudentAuth())
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && Array.isArray(data?.absences)) setAbsences(data.absences);
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
    >
      {attendance.error && (
        <div className="mb-4">
          <ErrorNotice message={attendance.error} onRetry={() => void attendance.reload()} />
        </div>
      )}
      <DtrSheet
        viewer="student"
        loading={attendance.loading}
        person={{
          name: student?.name || "",
          studentId: student?.student_id || "",
          program: student?.program,
          company: student?.company,
          supervisor,
        }}
        logs={attendance.logs.map((log) => ({ ...log, date: logDateKey(log) }))}
        absences={absences}
        holidays={holidays}
        certifications={certifications}
      />
    </StudentLayout>
  );
}
